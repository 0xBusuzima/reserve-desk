import { dutchHourForPrice, dutchPrice, exitPressure, licenseFloor, resolutionFee } from './math'
import type { Params } from './types'

/**
 * Standalone desk calculators. These answer the three questions a banker
 * actually has to make a decision on, without running a full simulation.
 */

// ---------------------------------------------------------------------------
// 1. Should I buy this license?
// ---------------------------------------------------------------------------

export interface PaybackInput {
  params: Params
  /** Total branches in the system right now, N. */
  branches: number
  /** The policy multiplier in force. */
  m: number
  /** Yesterday's closing license sale. 0 opens the day at the floor multiple. */
  lastClearingPrice: number
}

export interface PaybackPoint {
  hour: number
  price: number
  /** Days for the new branch's yield to repay the license. */
  paybackDays: number
}

export interface PaybackResult {
  floor: number
  open: number
  /** Daily yield of one *additional* branch, at N+1. */
  marginalYield: number
  curve: PaybackPoint[]
  /** Hour at which payback first drops under `targetDays`, or null. */
  hourForTarget(targetDays: number): number | null
}

/**
 * The day's license curve, annotated with payback.
 *
 * The number that matters is not the price, it is the price divided by what
 * the branch earns. A license is cheap at 3x yesterday's if the branch pays
 * for itself in a week, and expensive at the floor if it never does.
 */
export function licensePayback(input: PaybackInput): PaybackResult {
  const { params: p, branches, m, lastClearingPrice } = input
  const floor = licenseFloor(p, m, branches)
  const open = (lastClearingPrice > 0 ? lastClearingPrice : floor) * p.licenseOpenMultiple
  const marginalYield = (p.baseIssuancePerDay * m) / (branches + 1)

  const curve: PaybackPoint[] = []
  for (let hour = 0; hour <= 24; hour++) {
    const price = dutchPrice(open, floor, hour)
    curve.push({
      hour,
      price,
      paybackDays: marginalYield > 0 ? price / marginalYield : Infinity,
    })
  }

  return {
    floor,
    open,
    marginalYield,
    curve,
    hourForTarget(targetDays: number) {
      if (marginalYield <= 0) return null
      const target = targetDays * marginalYield
      if (target >= open) return 0
      if (target < floor) return null
      return dutchHourForPrice(open, floor, target)
    },
  }
}

// ---------------------------------------------------------------------------
// 2. What does it cost me to leave?
// ---------------------------------------------------------------------------

export interface ExitInput {
  params: Params
  /** Everything still held at the bank, D. */
  bankBalance: number
  /** Your own accrued balance. */
  yourBalance: number
  /** Branches you hold. */
  yourBranches: number
  /** Branches you intend to retire. */
  retiring: number
  /** Tokens withdrawn system-wide over the trailing seven days, W. */
  withdrawn7d: number
}

export interface ExitResult {
  pressure: number
  feeRate: number
  /** Balance liquidated by the retirement, pro rata. */
  released: number
  /** Fee paid, in tokens. */
  fee: number
  /** Tokens that actually reach your wallet. */
  net: number
  /** Of your fee, the half that is destroyed. */
  burned: number
  /** Of your fee, the half paid to bankers who stayed. */
  toStayers: number
  /** True if this retires your last branch and burns the charter. */
  dissolvesCharter: boolean
}

export function exitCost(input: ExitInput): ExitResult {
  const { params: p, bankBalance, yourBalance, yourBranches, retiring, withdrawn7d } = input
  const pressure = exitPressure(withdrawn7d, bankBalance, p.baseIssuancePerDay)
  const feeRate = resolutionFee(p, pressure)
  const k = yourBranches > 0 ? Math.min(retiring, yourBranches) / yourBranches : 0
  const released = yourBalance * k
  const fee = released * feeRate
  return {
    pressure,
    feeRate,
    released,
    fee,
    net: released - fee,
    burned: fee / 2,
    toStayers: fee / 2,
    dissolvesCharter: retiring >= yourBranches && yourBranches > 0,
  }
}

/** The full fee curve, for plotting. */
export function feeCurve(p: Params, points = 60): { pressure: number; fee: number }[] {
  const out: { pressure: number; fee: number }[] = []
  const max = Math.min(1, p.resolutionSaturation * 1.6)
  for (let i = 0; i <= points; i++) {
    const pressure = (i / points) * max
    out.push({ pressure, fee: resolutionFee(p, pressure) })
  }
  return out
}

// ---------------------------------------------------------------------------
// 3. What happens to the crowd if the bank runs?
// ---------------------------------------------------------------------------

export interface RunScenarioResult {
  /** Share of the bank attempting to leave inside the window. */
  share: number
  pressure: number
  feeRate: number
  /** Tokens the exiters collectively hand over. */
  feePaid: number
  /** Destroyed. */
  burned: number
  /** Split among everyone who stayed. */
  toStayers: number
  /** Per-token bonus to a staying banker, as a fraction of their balance. */
  stayerYield: number
}

/**
 * A one-shot run: `share` of the bank's balance tries to leave inside the
 * seven-day window. The stayers' bonus is what makes running first the wrong
 * move here. It is paid by the people who ran.
 */
export function runScenario(p: Params, bankBalance: number, share: number): RunScenarioResult {
  const leaving = bankBalance * share
  const staying = bankBalance - leaving
  const pressure = exitPressure(leaving, staying, p.baseIssuancePerDay)
  const feeRate = resolutionFee(p, pressure)
  const feePaid = leaving * feeRate
  const toStayers = feePaid / 2
  return {
    share,
    pressure,
    feeRate,
    feePaid,
    burned: feePaid / 2,
    toStayers,
    stayerYield: staying > 0 ? toStayers / staying : 0,
  }
}

// ---------------------------------------------------------------------------
// 4. How hard can the bank actually defend?
// ---------------------------------------------------------------------------

export interface DefenseResult {
  /** ETH the vault can deploy in a day under the throttle. */
  dailySpendEth: number
  /** That spend as a share of pool depth. */
  shareOfDepth: number
  /** Days to drain the vault at this rate. */
  daysToDrain: number
}

/**
 * The buyback throttle is min(0.10 * V, 0.002 * R) per hourly tick. Whichever
 * arm binds tells you what the defense is limited by: a thin vault or a thin
 * pool. If depth binds, adding ETH to the vault buys nothing.
 */
export function defenseCapacity(p: Params, vaultEth: number, poolEth: number): DefenseResult {
  let v = vaultEth
  let spent = 0
  for (let t = 0; t < p.buybackTicksPerDay; t++) {
    const tick = Math.max(0, Math.min(p.buybackVaultFraction * v, p.buybackDepthFraction * poolEth))
    if (tick <= 0) break
    v -= tick
    spent += tick
  }
  return {
    dailySpendEth: spent,
    shareOfDepth: poolEth > 0 ? spent / poolEth : 0,
    daysToDrain: spent > 0 ? vaultEth / spent : Infinity,
  }
}
