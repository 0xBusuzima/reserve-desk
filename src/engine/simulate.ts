import {
  buybackTickSpend,
  clamp,
  dutchPrice,
  exitPressure,
  licenseFloor,
  nextMultiplier,
  resolutionFee,
} from './math'
import { issuanceBudget } from './params'
import { addPol, buy, buybackAndBurn, makePool, sellForEthNotional, spot } from './pool'
import type { Cohort, CohortResult, DayFlow, DayState, Params, SimResult } from './types'

const EPS = 1e-9

/** Mutable per-cohort state carried through the run. */
interface CohortState {
  cfg: Cohort
  chartersAlive: number
  branches: number
  /** Unwithdrawn ledger balance at the bank. */
  balance: number
  realized: number
  spentOnLicenses: number
  redistributionsReceived: number
  /** Licenses bought today, reset each day. */
  boughtToday: number
  /** Set once a ghost cohort has been revoked. */
  revoked: boolean
}

export interface SimInput {
  params: Params
  cohorts: Cohort[]
  flows: DayFlow[]
}

/**
 * Run the economy day by day.
 *
 * Ordering within a day matters and follows the whitepaper's causal chain:
 *
 *   1. trade      the pool moves, fees accrue, net flow is measured
 *   2. policy     if an epoch closed, the multiplier steps
 *   3. issue      the day's issue is credited pro rata to branches
 *   4. expand     the license auction clears; payments burn
 *   5. exit       retirements liquidate, the resolution fee bites
 *   6. dormancy   ghosts are reported and revoked
 *   7. route fees vault / POL / team, then the buyback ticks
 *
 * Trading first because the signal must be measured before it is acted on;
 * fee routing last because it depends on the regime the day established.
 */
export function simulate({ params: p, cohorts, flows }: SimInput): SimResult {
  const budget = issuanceBudget(p)
  const pool = makePool(p.genesisPoolEth, p.genesisLiquidity)

  const states: CohortState[] = cohorts.map((cfg) => ({
    cfg,
    chartersAlive: cfg.charters,
    // "Every charter opens with its first branch."
    branches: cfg.charters,
    balance: 0,
    realized: 0,
    spentOnLicenses: 0,
    redistributionsReceived: 0,
    boughtToday: 0,
    revoked: false,
  }))

  let m = p.mLaunch
  let minted = 0
  /** Real tokens destroyed on the open market (buybacks). */
  let burnedTokens = 0
  /** Issuance credits destroyed before ever being minted (licenses, fees). */
  let burnedCredits = 0
  let issuedCumulative = 0
  let teamEth = 0
  let expansionVaultEth = 0
  let contractionVaultEth = 0

  /** Closed-epoch net flows, most recent last. */
  const epochFlows: number[] = []
  let epochNet = 0
  let epochElapsed = 0
  let epochIndex = 0

  /** Yesterday's closing license sale, in $STANDARD. 0 means nothing sold. */
  let lastLicensePrice = 0
  /** Yesterday's closing charter sale, in ETH. */
  let lastCharterPriceEth = 0

  /** Rolling window of daily gross withdrawals for the exit-pressure term. */
  const withdrawalWindow: number[] = []

  const days: DayState[] = []
  const violations: string[] = []
  let prevMaxSupply = p.hardCap

  const totalBranches = () => states.reduce((s, c) => s + c.branches, 0)
  const totalCharters = () => states.reduce((s, c) => s + c.chartersAlive, 0)
  const bankBalance = () => states.reduce((s, c) => s + c.balance, 0)

  for (let day = 0; day < flows.length; day++) {
    const flow = flows[day]
    for (const c of states) c.boughtToday = 0

    // -- 1. Trade ---------------------------------------------------------
    // Only tokens that exist outside the pool can be sold into it. At genesis
    // the float IS the pool, so sell pressure has to be bought or withdrawn
    // into existence first.
    const circulatingNow = p.genesisLiquidity + minted - burnedTokens
    const floatOutsidePool = Math.max(0, circulatingNow - pool.std)

    let feeEth = 0
    const b = buy(pool, flow.buysEth, p.tradingFeeBps)
    feeEth += b.feeEth
    const s = sellForEthNotional(pool, flow.sellsEth, p.tradingFeeBps, floatOutsidePool + b.stdOut)
    feeEth += s.feeEth

    // Net flow is measured on the ETH that actually moved, not the ETH the
    // scenario wished for: a sell that finds no tokens moves no capital.
    const sellsRealizedEth = s.ethOut + s.feeEth
    const netToday = flow.buysEth - sellsRealizedEth
    epochNet += netToday
    epochElapsed += 1

    // -- 2. Policy --------------------------------------------------------
    // The issuance decision reads the trailing two *completed* epochs, so a
    // single manipulated session cannot swing the rate.
    // The epoch net flow that fee routing should read: the epoch that just
    // closed if one did, otherwise the epoch still running.
    let regimeFlow = epochNet
    if (epochElapsed >= p.epochDays - EPS) {
      epochFlows.push(epochNet)
      regimeFlow = epochNet
      const n = epochFlows.length
      const signal = (epochFlows[n - 1] ?? 0) + (epochFlows[n - 2] ?? 0)
      m = nextMultiplier(p, m, signal)
      epochNet = 0
      epochElapsed = 0
      epochIndex++
    }
    const signalEth =
      (epochFlows[epochFlows.length - 1] ?? 0) + (epochFlows[epochFlows.length - 2] ?? 0)

    // Fee routing reads the sign of the *current* epoch: slow lever for
    // issuance, fast lever for defense.
    const regime: 'expansion' | 'contraction' = regimeFlow > 0 ? 'expansion' : 'contraction'

    // -- 3. Issue ---------------------------------------------------------
    const budgetLeft = Math.max(0, budget - issuedCumulative)
    const budgetExhausted = budgetLeft <= EPS
    const issueToday = Math.min(p.baseIssuancePerDay * m, budgetLeft)
    issuedCumulative += issueToday

    const N = totalBranches()
    const yieldPerBranch = N > 0 ? issueToday / N : 0
    if (N > 0) {
      for (const c of states) c.balance += yieldPerBranch * c.branches
    }

    // -- 4. Expand: the daily license Dutch auction ------------------------
    const floorPrice = licenseFloor(p, m, N)
    const openPrice =
      (lastLicensePrice > 0 ? lastLicensePrice : floorPrice) * p.licenseOpenMultiple
    let remaining = p.licensesPerDay
    let licensesSold = 0
    let clearing = 0

    // First come, first served down the curve: at each hour, every cohort
    // whose payback test passes takes as much as its caps and balance allow.
    for (let hour = 0; hour < 24 && remaining > 0; hour++) {
      const price = dutchPrice(openPrice, floorPrice, hour)
      if (price <= 0) break
      for (const c of states) {
        if (remaining <= 0) break
        // Compounders and harvesters both bid: a harvester is an active
        // banker who expands when licenses are cheap and takes profit when
        // the balance builds up. Only pure holders and panickers sit out.
        const bids = c.cfg.strategy === 'compound' || c.cfg.strategy === 'harvest'
        if (!bids || c.revoked || c.chartersAlive <= 0) continue

        // A new branch earns baseIssuance * m / (N + 1) per day. Payback is
        // the price divided by that, and it is the only thing a rational
        // expander needs to look at.
        const marginalYield = (p.baseIssuancePerDay * m) / (N + 1)
        if (marginalYield <= 0) continue
        const paybackDays = price / marginalYield
        if (paybackDays > c.cfg.paybackThresholdDays) continue

        const capacity = c.chartersAlive * p.maxBranchesPerCharter - c.branches
        const dailyCap = c.chartersAlive * p.licensesPerCharterPerDay - c.boughtToday
        const affordable = Math.floor(c.balance / price)
        const want = Math.min(remaining, capacity, dailyCap, affordable)
        if (want <= 0) continue

        const cost = want * price
        c.balance -= cost
        c.spentOnLicenses += cost
        c.branches += want
        c.boughtToday += want
        burnedCredits += cost
        remaining -= want
        licensesSold += want
        clearing = price
      }
    }
    lastLicensePrice = clearing > 0 ? clearing : 0

    // -- 5. Exit: retirements and the resolution fee -----------------------
    const D = bankBalance()
    const withdrawn7d = withdrawalWindow.reduce((a, x) => a + x, 0)
    const pressure = exitPressure(withdrawn7d, D, p.baseIssuancePerDay)
    const feeRate = resolutionFee(p, pressure)

    let withdrawnToday = 0
    let redistributedToday = 0

    for (const c of states) {
      if (c.revoked || c.branches <= 0 || c.balance <= 0) continue

      let retire = 0
      if (c.cfg.strategy === 'harvest') {
        // Retire one branch per charter once the accrued balance on that
        // branch is worth more than `harvestMultiple` days of its own yield.
        const perBranch = c.balance / c.branches
        if (perBranch >= c.cfg.harvestMultiple * yieldPerBranch && yieldPerBranch > 0) {
          retire = Math.min(c.branches, c.chartersAlive)
        }
      } else if (c.cfg.strategy === 'panic') {
        // Everything, the moment policy hits its floor.
        // Within one cut-step of the floor is close enough to spook them.
        if (m <= p.mMin + p.rateCut / 2) retire = c.branches
      }
      if (retire <= 0) continue

      // Pro rata rule: retiring k of b branches liquidates k/b of the balance.
      const released = c.balance * (retire / c.branches)
      const fee = released * feeRate
      c.balance -= released
      c.branches -= retire
      c.realized += released - fee
      minted += released - fee
      withdrawnToday += released

      // Half of every fee is burned; the other half is paid to every banker
      // who stayed. This is what inverts the payoff structure of a run.
      burnedCredits += fee / 2
      redistributedToday += fee / 2

      // Closing the last store dissolves the company. A cohort is modelled as
      // homogeneous, so charters only burn when the retirement takes every
      // charter's last branch. Retiring one branch each out of nine leaves
      // every charter alive.
      if (c.branches <= EPS) {
        c.branches = 0
        c.chartersAlive = 0
      }
    }

    // -- 6. Dormancy -------------------------------------------------------
    if (day + 1 >= p.dormancyDays) {
      for (const c of states) {
        if (c.cfg.strategy !== 'hold' || c.revoked) continue
        // Only a cohort explicitly flagged as never interacting goes dark;
        // the whitepaper is clear that a zero-cost check-in exists, so an
        // attentive holder is never reportable. We model ghosts as holders
        // with a zero payback threshold, see makeCohorts().
        if (c.cfg.paybackThresholdDays !== 0) continue
        const bal = c.balance
        if (bal <= 0) continue
        const fee = bal * p.revocationFee
        const bounty = Math.min(bal * p.dormancyBounty, p.dormancyBountyCap)
        // The bounty is paid out of the fee: 2% + 70% + 30% would otherwise
        // exceed the balance. This reading is an assumption, see METHODOLOGY.
        const feeAfterBounty = Math.max(0, fee - bounty)
        burnedCredits += feeAfterBounty / 2
        redistributedToday += feeAfterBounty / 2
        // Bounty and the ghost's 30% both leave the bank as real tokens.
        minted += bounty + bal * (1 - p.revocationFee)
        c.realized += bal * (1 - p.revocationFee)
        c.balance = 0
        c.branches = 0
        c.chartersAlive = 0
        c.revoked = true
        withdrawnToday += bal
      }
    }

    // Redistribute to everyone still at their desk, pro rata by branches.
    const stayingBranches = states.reduce((a, c) => a + (c.revoked ? 0 : c.branches), 0)
    if (redistributedToday > 0 && stayingBranches > 0) {
      for (const c of states) {
        if (c.revoked || c.branches <= 0) continue
        const share = redistributedToday * (c.branches / stayingBranches)
        c.balance += share
        c.redistributionsReceived += share
      }
    } else if (redistributedToday > 0) {
      // Nobody left to pay: the whole fee burns.
      burnedCredits += redistributedToday
      redistributedToday = 0
    }

    withdrawalWindow.push(withdrawnToday)
    if (withdrawalWindow.length > p.exitWindowDays) withdrawalWindow.shift()

    // -- 7. Charter auction, then route the fee engine ---------------------
    if (p.charterAuctionsPerDay > 0) {
      const cFloor = p.charterFloorEth
      const cOpen = (lastCharterPriceEth > 0 ? lastCharterPriceEth : cFloor) * p.charterOpenMultiple
      // Seats clear somewhere on the curve; absent a demand model for
      // newcomers we settle them at the midpoint of the day, which is the
      // geometric mean of the open and the floor.
      const clearingEth = dutchPrice(cOpen, cFloor, 12)
      const proceeds = clearingEth * p.charterAuctionsPerDay
      feeEth += proceeds
      lastCharterPriceEth = clearingEth
      const entrants = states.find((c) => c.cfg.id === 'auction')
      if (entrants) {
        entrants.chartersAlive += p.charterAuctionsPerDay
        entrants.branches += p.charterAuctionsPerDay
        entrants.revoked = false
      }
    }

    const toVault = feeEth * p.splitVault
    const toPol = feeEth * p.splitPol
    const toTeam = feeEth * p.splitTeam
    teamEth += toTeam
    if (toPol > 0) addPol(pool, toPol)
    if (regime === 'expansion') expansionVaultEth += toVault
    else contractionVaultEth += toVault

    // The contraction vault buys and burns in small rate-limited steps, so
    // defense cannot be baited into one blockable shot.
    let buybackEth = 0
    let buybackBurned = 0
    for (let tick = 0; tick < p.buybackTicksPerDay; tick++) {
      const spend = buybackTickSpend(p, contractionVaultEth, pool.eth)
      if (spend <= EPS) break
      contractionVaultEth -= spend
      buybackEth += spend
      buybackBurned += buybackAndBurn(pool, spend)
    }
    burnedTokens += buybackBurned

    // -- Record ------------------------------------------------------------
    const burned = burnedTokens + burnedCredits
    const circulating = p.genesisLiquidity + minted - burnedTokens
    const maxSup = p.hardCap - burned

    if (circulating < -EPS) violations.push(`day ${day}: circulating supply went negative`)
    if (maxSup > prevMaxSupply + EPS) violations.push(`day ${day}: S_max increased`)
    if (issuedCumulative > budget + EPS) violations.push(`day ${day}: issuance exceeded budget`)
    if (bankBalance() < -EPS) violations.push(`day ${day}: bank balance went negative`)
    for (const c of states) {
      if (c.branches > c.chartersAlive * p.maxBranchesPerCharter + EPS) {
        violations.push(`day ${day}: ${c.cfg.id} exceeded the branch cap`)
      }
    }
    prevMaxSupply = maxSup

    days.push({
      day,
      epoch: epochIndex,
      netFlowEth: netToday,
      signalEth,
      m,
      regime,
      minted,
      burned,
      circulating,
      maxSupply: maxSup,
      issuedCumulative,
      budgetExhausted,
      bankBalance: bankBalance(),
      branches: totalBranches(),
      charters: totalCharters(),
      yieldPerBranch,
      licenseClearingPrice: clearing,
      licensesSold,
      licenseFloor: floorPrice,
      withdrawnToday,
      exitPressure: pressure,
      resolutionFee: feeRate,
      redistributed: redistributedToday,
      expansionVaultEth,
      contractionVaultEth,
      buybackEth,
      buybackBurned,
      teamEth,
      poolEth: pool.eth,
      poolStd: pool.std,
      price: spot(pool),
      feeEth,
    })
  }

  const results: CohortResult[] = states.map((c) => ({
    id: c.cfg.id,
    label: c.cfg.label,
    strategy: c.cfg.strategy,
    chartersAlive: c.chartersAlive,
    branches: c.branches,
    accrued: c.balance,
    realized: c.realized,
    spentOnLicenses: c.spentOnLicenses,
    redistributionsReceived: c.redistributionsReceived,
    netTokens: c.realized + c.balance - c.spentOnLicenses,
  }))

  return { params: p, days, cohorts: results, violations }
}

/**
 * The default population of the genesis cohort: 1,000 Founding Charters split
 * across four temperaments plus an empty seat for auction entrants.
 *
 * A ghost is modelled as a holder with a zero payback threshold, the flag the
 * dormancy pass looks for.
 */
export function makeCohorts(foundingCharters = 1_000): Cohort[] {
  const share = (f: number) => Math.max(0, Math.round(foundingCharters * f))
  return [
    {
      id: 'compound',
      label: 'Compounders',
      strategy: 'compound',
      charters: share(0.35),
      paybackThresholdDays: 20,
      harvestMultiple: 0,
    },
    {
      id: 'hold',
      label: 'Holders',
      strategy: 'hold',
      charters: share(0.3),
      paybackThresholdDays: 1,
      harvestMultiple: 0,
    },
    {
      id: 'harvest',
      label: 'Harvesters',
      strategy: 'harvest',
      charters: share(0.2),
      paybackThresholdDays: 10,
      harvestMultiple: 30,
    },
    {
      id: 'panic',
      label: 'Weak hands',
      strategy: 'panic',
      charters: share(0.1),
      paybackThresholdDays: 0,
      harvestMultiple: 0,
    },
    {
      id: 'ghost',
      label: 'Ghosts',
      strategy: 'hold',
      charters: share(0.05),
      paybackThresholdDays: 0,
      harvestMultiple: 0,
    },
    {
      id: 'auction',
      label: 'Auction entrants',
      strategy: 'compound',
      charters: 0,
      paybackThresholdDays: 20,
      harvestMultiple: 0,
    },
  ]
}

/** Clamp a cohort set so it never claims more charters than genesis allows. */
export function normalizeCohorts(cohorts: Cohort[], cap: number): Cohort[] {
  const genesis = cohorts.filter((c) => c.id !== 'auction')
  const total = genesis.reduce((a, c) => a + c.charters, 0)
  if (total <= cap || total === 0) return cohorts
  const k = cap / total
  return cohorts.map((c) =>
    c.id === 'auction' ? c : { ...c, charters: Math.round(c.charters * k) },
  )
}

export { clamp }
