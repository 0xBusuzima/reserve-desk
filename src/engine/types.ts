/**
 * Reserve Desk: type definitions for The Standard Reserve simulation engine.
 *
 * Every mechanic here is transcribed from the public whitepaper (v0.1) at
 * https://www.standardreserve.xyz/whitepaper/. The whitepaper deliberately
 * redacts its numeric launch parameters ("Final parameters will be announced
 * closer to launch"), so every number in Params is an OPERATOR-SUPPLIED
 * ASSUMPTION, not an official value. See docs/METHODOLOGY.md.
 */

export interface Params {
  // -- The currency (section 3) ----------------------------------------
  /** Hard cap on $STANDARD. Whitepaper: 1,000,000,000. */
  hardCap: number
  /** Pre-mint locked as protocol-owned liquidity. Whitepaper: 100,000,000. */
  genesisLiquidity: number

  // -- Monetary policy (section 5) -------------------------------------
  /** Base issuance in $STANDARD per day, before the multiplier. REDACTED. */
  baseIssuancePerDay: number
  /** Policy multiplier at launch. REDACTED. */
  mLaunch: number
  /** Multiplier floor. REDACTED. */
  mMin: number
  /** Multiplier ceiling. REDACTED. */
  mMax: number
  /** Epoch length in days. REDACTED. */
  epochDays: number
  /** Additive step applied to m when the signal is non-positive. REDACTED. */
  rateCut: number
  /** Additive step applied to m when the signal is positive. REDACTED. */
  rateRaise: number

  // -- Charters and branches (sections 6, 7) ---------------------------
  /** Founding Charters minted free at genesis. Whitepaper: 1,000. */
  foundingCharters: number
  /** Maximum branches per charter. Whitepaper: 10. */
  maxBranchesPerCharter: number
  /** Expansion licenses offered per day. Whitepaper: "initially 100". */
  licensesPerDay: number
  /** Licenses a single charter may buy per day. Whitepaper: 3. */
  licensesPerCharterPerDay: number
  /**
   * License floor, as a multiple of one branch's daily yield.
   * Whitepaper: "about two days of one branch's yield" => 2.
   */
  licenseFloorDaysOfYield: number
  /** Opening price multiple on yesterday's closing sale. Whitepaper: 2x. */
  licenseOpenMultiple: number
  /** Charters auctioned per day in ETH. Whitepaper: "starts at zero". */
  charterAuctionsPerDay: number
  /** Charter auction reserve price in ETH. REDACTED (admin-set). */
  charterFloorEth: number
  /** Opening multiple on yesterday's closing charter sale. Whitepaper: 3x. */
  charterOpenMultiple: number

  // -- Exits (section 9) -----------------------------------------------
  /** Resolution fee floor, as a fraction. REDACTED. */
  resolutionFeeFloor: number
  /** Resolution fee ceiling, as a fraction. REDACTED (below 0.70, see s10). */
  resolutionFeeCeiling: number
  /** Exit pressure at which the fee saturates at the ceiling. REDACTED. */
  resolutionSaturation: number
  /** Trailing window for exit pressure, in days. Whitepaper: 7. */
  exitWindowDays: number

  // -- Dormancy (section 10) -------------------------------------------
  /** Days of inactivity before a wallet is reportable. Whitepaper: 30. */
  dormancyDays: number
  /** Informant bounty as a fraction of the dormant balance. Whitepaper: 2%. */
  dormancyBounty: number
  /** Cap on the bounty in $STANDARD. Whitepaper: 100,000. */
  dormancyBountyCap: number
  /** Revocation fee on a dormant balance. Whitepaper: 70%. */
  revocationFee: number

  // -- Fees, reserves, defense (section 11) ----------------------------
  /** Swap fee on the hooked v4 pool, in basis points. REDACTED. */
  tradingFeeBps: number
  /** Fee ETH routed to the active vault. Whitepaper: 70%. */
  splitVault: number
  /** Fee ETH routed to protocol-owned liquidity. Whitepaper: 15%. */
  splitPol: number
  /** Fee ETH routed to the team. Whitepaper: 15%. */
  splitTeam: number
  /** Per-tick cap as a fraction of the contraction vault. Whitepaper: 0.10. */
  buybackVaultFraction: number
  /** Per-tick cap as a fraction of pool ETH depth. Whitepaper: 0.002. */
  buybackDepthFraction: number
  /** Buyback ticks per day. Whitepaper: hourly => 24. */
  buybackTicksPerDay: number

  // -- The pool (section 2) --------------------------------------------
  /** ETH seeded alongside the 100M genesis $STANDARD. REDACTED. */
  genesisPoolEth: number
}

/** How a simulated cohort of bankers behaves. */
export type StrategyKind =
  /** Never expand, never exit. Sit on the genesis charter. */
  | 'hold'
  /** Buy licenses whenever payback beats paybackThresholdDays. */
  | 'compound'
  /** Retire one branch as soon as the accrued balance clears a target. */
  | 'harvest'
  /** Retire everything the moment the multiplier hits its floor. */
  | 'panic'

export interface Cohort {
  id: string
  label: string
  strategy: StrategyKind
  /** Number of charters behaving this way. */
  charters: number
  /** compound: buy a license only if it pays for itself within N days. */
  paybackThresholdDays: number
  /** harvest: retire a branch once accrued exceeds N days of its yield. */
  harvestMultiple: number
}

/** Net ETH flow through the pool, per day. */
export interface DayFlow {
  /** Gross ETH entering from buys. */
  buysEth: number
  /** Gross ETH leaving from sells. */
  sellsEth: number
}

export interface Scenario {
  id: string
  label: string
  description: string
  /** Generates `days` days of gross flow. */
  generate(days: number, seed: number): DayFlow[]
}

/** One simulated day of the whole economy. */
export interface DayState {
  day: number
  epoch: number

  // Policy
  /** Net flow accumulated in the current epoch (ETH). */
  netFlowEth: number
  /** signal_n = F_{n-1} + F_{n-2} (ETH). */
  signalEth: number
  /** Policy multiplier in force this day. */
  m: number
  /** expansion when the epoch's net flow is positive, else contraction. */
  regime: 'expansion' | 'contraction'

  // Supply. The section 3 identity holds at every step.
  /** Cumulative tokens minted by withdrawals, M(t). */
  minted: number
  /** Cumulative tokens burned, B(t). */
  burned: number
  /** S_circ = genesisLiquidity + M(t) - B(t). */
  circulating: number
  /** S_max = hardCap - B(t). */
  maxSupply: number
  /** Cumulative issuance against the 900M budget. */
  issuedCumulative: number
  /** True once the issuance budget is exhausted. */
  budgetExhausted: boolean

  // The bank's ledger
  /** Total $STANDARD accrued but not yet withdrawn, D. */
  bankBalance: number
  /** Total branches in the system, N. */
  branches: number
  /** Live charters. */
  charters: number
  /** One branch's yield for this day. */
  yieldPerBranch: number

  // Auctions
  /** Clearing price of the day's last license sale, in $STANDARD. */
  licenseClearingPrice: number
  /** Licenses sold today. */
  licensesSold: number
  /** License floor today. */
  licenseFloor: number

  // Exits
  /** Tokens withdrawn system-wide today (gross, before fee). */
  withdrawnToday: number
  /** Trailing-window exit pressure, P in 9.1. */
  exitPressure: number
  /** Resolution fee in force, as a fraction. */
  resolutionFee: number
  /** Fee tokens redistributed to bankers who stayed today. */
  redistributed: number

  // Vaults and the pool
  /** ETH accumulated in the expansion vault (hard reserves). */
  expansionVaultEth: number
  /** ETH sitting in the contraction vault, unspent. */
  contractionVaultEth: number
  /** ETH spent on buybacks today. */
  buybackEth: number
  /** $STANDARD bought back and burned today. */
  buybackBurned: number
  /** Cumulative ETH sent to the team. */
  teamEth: number
  /** Pool ETH reserve. */
  poolEth: number
  /** Pool $STANDARD reserve. */
  poolStd: number
  /** Spot price, ETH per $STANDARD. */
  price: number
  /** Fee ETH collected today across trading and charter auctions. */
  feeEth: number
}

export interface CohortResult {
  id: string
  label: string
  strategy: StrategyKind
  /** Charters still alive at the end. */
  chartersAlive: number
  /** Branches held at the end. */
  branches: number
  /** Unwithdrawn ledger balance. */
  accrued: number
  /** Tokens actually received in wallets, net of resolution fees. */
  realized: number
  /** Tokens spent on expansion licenses (all burned). */
  spentOnLicenses: number
  /** Fee tokens received for staying while others exited. */
  redistributionsReceived: number
  /**
   * realized + accrued - spentOnLicenses: what the cohort is up, in tokens,
   * ignoring price. Licenses are paid out of earnings, so this is the honest
   * "did expanding beat holding" number.
   */
  netTokens: number
}

export interface SimResult {
  params: Params
  days: DayState[]
  /** Per-cohort outcome at the end of the run. */
  cohorts: CohortResult[]
  /** Invariant violations found during the run. Should always be empty. */
  violations: string[]
}
