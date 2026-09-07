import type { Params } from './types'

// ---------------------------------------------------------------------------
// Section 7: the Dutch auction curve
// ---------------------------------------------------------------------------

/**
 * Price along a falling-price Dutch auction, whitepaper eq. (7.1):
 *
 *     P(t) = P_start * (P_floor / P_start)^(t / 24h)
 *
 * `t` is hours elapsed in the day. The curve is exponential, so it spends most
 * of the day near the floor: the top of the book is thin and the tail is fat.
 */
export function dutchPrice(
  pStart: number,
  pFloor: number,
  hoursElapsed: number,
  dayHours = 24,
): number {
  if (pStart <= 0) return 0
  if (pFloor <= 0) return 0
  const t = clamp(hoursElapsed / dayHours, 0, 1)
  return pStart * Math.pow(pFloor / pStart, t)
}

/**
 * Inverse of {@link dutchPrice}: the hour at which the curve first reaches
 * `target`. Returns 0 if the day opens at or below the target, and `dayHours`
 * if the floor never gets there.
 */
export function dutchHourForPrice(
  pStart: number,
  pFloor: number,
  target: number,
  dayHours = 24,
): number {
  if (target >= pStart) return 0
  if (target <= pFloor) return dayHours
  return (dayHours * Math.log(target / pStart)) / Math.log(pFloor / pStart)
}

/**
 * The expansion license floor. The whitepaper puts it at "about two days of
 * one branch's yield", and one branch's daily yield in a system of N branches
 * is baseIssuance * m / N.
 */
export function licenseFloor(p: Params, m: number, branches: number): number {
  const n = Math.max(1, branches)
  const dailyYield = (p.baseIssuancePerDay * m) / n
  return dailyYield * p.licenseFloorDaysOfYield
}

// ---------------------------------------------------------------------------
// Section 5: the policy multiplier
// ---------------------------------------------------------------------------

/**
 * The multiplier update, whitepaper eq. (5.2). The equation itself is redacted;
 * what the whitepaper states about it is that the range is bounded, that a
 * positive signal raises the rate and a non-positive signal cuts it, and that
 * "cuts are immediate, raises must be earned", i.e. the cut step is the larger
 * of the two. We model the smallest rule satisfying all three: a bounded
 * additive step whose sign follows the signal.
 */
export function nextMultiplier(p: Params, m: number, signalEth: number): number {
  const stepped = signalEth > 0 ? m + p.rateRaise : m - p.rateCut
  return clamp(stepped, p.mMin, p.mMax)
}

/** Epochs to walk the multiplier from `from` to `to` under a sustained signal. */
export function epochsToTravel(p: Params, from: number, to: number): number {
  if (to === from) return 0
  const step = to > from ? p.rateRaise : p.rateCut
  if (step <= 0) return Infinity
  return Math.ceil(Math.abs(to - from) / step)
}

// ---------------------------------------------------------------------------
// Section 9: the resolution fee
// ---------------------------------------------------------------------------

/**
 * Exit pressure, whitepaper eq. (9.1):
 *
 *     P = W / max(D + W, floor)
 *
 * `W` is tokens withdrawn system-wide over the trailing window, `D` is
 * everything still held at the bank. The denominator floor keeps the ratio
 * finite when the bank is nearly empty; we use one day of issuance for it,
 * which is the smallest scale that is always non-zero while the bank issues.
 */
export function exitPressure(withdrawn7d: number, bankBalance: number, denomFloor = 1): number {
  const denom = Math.max(bankBalance + withdrawn7d, denomFloor)
  if (denom <= 0) return 0
  return clamp(withdrawn7d / denom, 0, 1)
}

/**
 * The resolution fee: "a quadratic curve from a floor to a ceiling, saturating
 * when [some share] of the bank tries to leave in a week."
 *
 *     fee = floor + (ceiling - floor) * min(P / P_sat, 1)^2
 */
export function resolutionFee(p: Params, pressure: number): number {
  const sat = p.resolutionSaturation <= 0 ? 1 : p.resolutionSaturation
  const x = clamp(pressure / sat, 0, 1)
  return p.resolutionFeeFloor + (p.resolutionFeeCeiling - p.resolutionFeeFloor) * x * x
}

// ---------------------------------------------------------------------------
// Section 11: buyback throttle
// ---------------------------------------------------------------------------

/**
 * Per-tick buyback spend, whitepaper eq. (11.1):
 *
 *     spend_tick = min(0.10 * V, 0.002 * R)
 *
 * `V` is the contraction vault balance, `R` is pool ETH reserves. Unspent
 * balance rolls forward; the vault can never sell.
 */
export function buybackTickSpend(p: Params, vaultEth: number, poolEth: number): number {
  return Math.max(0, Math.min(p.buybackVaultFraction * vaultEth, p.buybackDepthFraction * poolEth))
}

// ---------------------------------------------------------------------------
// Section 3: the supply identity
// ---------------------------------------------------------------------------

/** S_circ(t) = genesis liquidity + M(t) - B(t), whitepaper eq. (3.1). */
export function circulatingSupply(p: Params, minted: number, burned: number): number {
  return p.genesisLiquidity + minted - burned
}

/** S_max(t) = hard cap - B(t), whitepaper eq. (3.2). Strictly non-increasing. */
export function maxSupply(p: Params, burned: number): number {
  return p.hardCap - burned
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}

/**
 * mulberry32, a small deterministic PRNG. Scenarios must be reproducible so
 * that two runs of the same seed compare like for like.
 */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
