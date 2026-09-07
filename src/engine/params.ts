import type { Params } from './types'

/**
 * Where each parameter's value comes from.
 *
 * `whitepaper` stated verbatim in whitepaper v0.1.
 * `derived`    the whitepaper states the rule, the number follows from it.
 * `assumed`    the whitepaper redacts the number. This is my placeholder.
 */
export type Provenance = 'whitepaper' | 'derived' | 'assumed'

export const PROVENANCE: Record<keyof Params, Provenance> = {
  hardCap: 'whitepaper',
  genesisLiquidity: 'whitepaper',

  baseIssuancePerDay: 'assumed',
  mLaunch: 'assumed',
  mMin: 'assumed',
  mMax: 'assumed',
  epochDays: 'assumed',
  rateCut: 'assumed',
  rateRaise: 'assumed',

  foundingCharters: 'whitepaper',
  maxBranchesPerCharter: 'whitepaper',
  licensesPerDay: 'whitepaper',
  licensesPerCharterPerDay: 'whitepaper',
  licenseFloorDaysOfYield: 'derived',
  licenseOpenMultiple: 'whitepaper',
  charterAuctionsPerDay: 'whitepaper',
  charterFloorEth: 'assumed',
  charterOpenMultiple: 'whitepaper',

  resolutionFeeFloor: 'assumed',
  resolutionFeeCeiling: 'assumed',
  resolutionSaturation: 'assumed',
  exitWindowDays: 'whitepaper',

  dormancyDays: 'whitepaper',
  dormancyBounty: 'whitepaper',
  dormancyBountyCap: 'whitepaper',
  revocationFee: 'whitepaper',

  tradingFeeBps: 'assumed',
  splitVault: 'whitepaper',
  splitPol: 'whitepaper',
  splitTeam: 'whitepaper',
  buybackVaultFraction: 'whitepaper',
  buybackDepthFraction: 'whitepaper',
  buybackTicksPerDay: 'whitepaper',

  genesisPoolEth: 'assumed',
}

/**
 * The baseline parameter set.
 *
 * Whitepaper-stated values are exact. Redacted values are chosen to satisfy
 * every qualitative constraint the whitepaper *does* state:
 *
 *  - "cuts are immediate, raises must be earned" => rateCut > rateRaise.
 *  - the ceiling is reachable and the floor bites => mMin < mLaunch < mMax,
 *    with mLaunch below 1.0 so "sustained inflows reach full issue" is a
 *    real event rather than the starting condition.
 *  - the revocation fee (70%) is "deliberately worse than the worst-case
 *    resolution fee" => resolutionFeeCeiling < 0.70.
 *  - the license floor is "about two days of one branch's yield".
 *  - buybacks are bounded "near 5% of pool depth per day at launch settings"
 *    => 24 ticks x 0.002 of depth = 4.8%.
 *
 * The issuance budget (900M) divided by the base rate sets the nominal life
 * of the issue: 250,000/day at m = 1.0 runs 3,600 days, a shade under ten
 * years. Raise the rate and the budget is gone in a cycle; that trade-off is
 * the single most consequential redacted number in the whitepaper.
 */
export const DEFAULT_PARAMS: Params = {
  hardCap: 1_000_000_000,
  genesisLiquidity: 100_000_000,

  baseIssuancePerDay: 250_000,
  mLaunch: 0.5,
  mMin: 0.25,
  mMax: 2.0,
  epochDays: 1,
  rateCut: 0.15,
  rateRaise: 0.05,

  foundingCharters: 1_000,
  maxBranchesPerCharter: 10,
  licensesPerDay: 100,
  licensesPerCharterPerDay: 3,
  licenseFloorDaysOfYield: 2,
  licenseOpenMultiple: 2,
  charterAuctionsPerDay: 0,
  charterFloorEth: 0.05,
  charterOpenMultiple: 3,

  resolutionFeeFloor: 0.02,
  resolutionFeeCeiling: 0.5,
  resolutionSaturation: 0.25,
  exitWindowDays: 7,

  dormancyDays: 30,
  dormancyBounty: 0.02,
  dormancyBountyCap: 100_000,
  revocationFee: 0.7,

  tradingFeeBps: 100,
  splitVault: 0.7,
  splitPol: 0.15,
  splitTeam: 0.15,
  buybackVaultFraction: 0.1,
  buybackDepthFraction: 0.002,
  buybackTicksPerDay: 24,

  genesisPoolEth: 300,
}

/** The issuance budget: hard cap minus the genesis pre-mint. */
export function issuanceBudget(p: Params): number {
  return p.hardCap - p.genesisLiquidity
}

export interface ParamMeta {
  key: keyof Params
  label: string
  group: string
  min: number
  max: number
  step: number
  /** Rendering hint. */
  unit: 'token' | 'eth' | 'pct' | 'day' | 'x' | 'bps' | 'count'
  help: string
  /**
   * The id of the page section this knob most visibly moves. Changing the
   * control scrolls the reader to that section so they can watch it land.
   */
  section: 'policy' | 'supply' | 'defense' | 'desk'
}

/** Everything the Policy Lab exposes as a control, in display order. */
export const PARAM_META: ParamMeta[] = [
  {
    key: 'baseIssuancePerDay',
    label: 'Base issuance',
    group: 'Monetary policy',
    min: 50_000,
    max: 2_000_000,
    step: 50_000,
    unit: 'token',
    help: 'Tokens issued per day at m = 1.0, split pro rata across all branches. Redacted in the whitepaper.',
    section: 'policy',
  },
  {
    key: 'mLaunch',
    label: 'Multiplier at launch',
    group: 'Monetary policy',
    min: 0.1,
    max: 3,
    step: 0.05,
    unit: 'x',
    help: 'Where policy starts. The whitepaper implies launch sits below full issue, so inflows have somewhere to go.',
    section: 'policy',
  },
  {
    key: 'mMin',
    label: 'Multiplier floor',
    group: 'Monetary policy',
    min: 0,
    max: 1,
    step: 0.05,
    unit: 'x',
    help: 'How far the bank can cut issuance when capital leaves.',
    section: 'policy',
  },
  {
    key: 'mMax',
    label: 'Multiplier ceiling',
    group: 'Monetary policy',
    min: 1,
    max: 5,
    step: 0.1,
    unit: 'x',
    help: 'The most generous the bank ever gets, no matter how strong inflows are.',
    section: 'policy',
  },
  {
    key: 'epochDays',
    label: 'Epoch length',
    group: 'Monetary policy',
    min: 0.25,
    max: 7,
    step: 0.25,
    unit: 'day',
    help: 'How often policy is re-evaluated. The signal aggregates the two completed epochs before it.',
    section: 'policy',
  },
  {
    key: 'rateCut',
    label: 'Rate cut per epoch',
    group: 'Monetary policy',
    min: 0.01,
    max: 0.5,
    step: 0.01,
    unit: 'x',
    help: 'Applied when the signal is non-positive. Must exceed the raise: cuts are immediate, raises are earned.',
    section: 'policy',
  },
  {
    key: 'rateRaise',
    label: 'Rate raise per epoch',
    group: 'Monetary policy',
    min: 0.01,
    max: 0.5,
    step: 0.01,
    unit: 'x',
    help: 'Applied when the signal is positive.',
    section: 'policy',
  },

  {
    key: 'licensesPerDay',
    label: 'Licenses per day',
    group: 'Expansion',
    min: 0,
    max: 500,
    step: 10,
    unit: 'count',
    help: 'Expansion licenses offered at the daily Dutch auction. Whitepaper: initially 100.',
    section: 'policy',
  },
  {
    key: 'licenseFloorDaysOfYield',
    label: 'License floor',
    group: 'Expansion',
    min: 0.5,
    max: 10,
    step: 0.5,
    unit: 'day',
    help: 'The floor, in days of one branch yield. The whitepaper says about two.',
    section: 'desk',
  },
  {
    key: 'licenseOpenMultiple',
    label: 'License open multiple',
    group: 'Expansion',
    min: 1.1,
    max: 5,
    step: 0.1,
    unit: 'x',
    help: 'Each day opens at this multiple of yesterday closing sale. Whitepaper: 2x.',
    section: 'desk',
  },
  {
    key: 'charterAuctionsPerDay',
    label: 'Charter auctions per day',
    group: 'Expansion',
    min: 0,
    max: 50,
    step: 1,
    unit: 'count',
    help: 'New seats sold for ETH each day. Starts at zero and is policy-controlled.',
    section: 'policy',
  },
  {
    key: 'charterFloorEth',
    label: 'Charter reserve price',
    group: 'Expansion',
    min: 0.001,
    max: 5,
    step: 0.005,
    unit: 'eth',
    help: 'Admin-set floor for the charter auction.',
    section: 'policy',
  },

  {
    key: 'resolutionFeeFloor',
    label: 'Resolution fee floor',
    group: 'Exits',
    min: 0,
    max: 0.2,
    step: 0.005,
    unit: 'pct',
    help: 'What a withdrawal costs when nobody else is leaving.',
    section: 'desk',
  },
  {
    key: 'resolutionFeeCeiling',
    label: 'Resolution fee ceiling',
    group: 'Exits',
    min: 0.05,
    max: 0.69,
    step: 0.01,
    unit: 'pct',
    help: 'The worst case. Must stay under the 70% revocation fee, or going dark becomes the cheap way out.',
    section: 'desk',
  },
  {
    key: 'resolutionSaturation',
    label: 'Saturation pressure',
    group: 'Exits',
    min: 0.05,
    max: 1,
    step: 0.05,
    unit: 'pct',
    help: 'The share of the bank leaving in seven days that pins the fee at its ceiling.',
    section: 'desk',
  },

  {
    key: 'tradingFeeBps',
    label: 'Trading fee',
    group: 'Fees and defense',
    min: 5,
    max: 300,
    step: 5,
    unit: 'bps',
    help: 'Swap fee on the hooked v4 pool. Every swap feeds the bank ETH.',
    section: 'defense',
  },
  {
    key: 'buybackVaultFraction',
    label: 'Buyback: vault cap per tick',
    group: 'Fees and defense',
    min: 0.01,
    max: 0.5,
    step: 0.01,
    unit: 'pct',
    help: 'Each hourly tick spends at most this fraction of the contraction vault.',
    section: 'defense',
  },
  {
    key: 'buybackDepthFraction',
    label: 'Buyback: depth cap per tick',
    group: 'Fees and defense',
    min: 0.0002,
    max: 0.01,
    step: 0.0002,
    unit: 'pct',
    help: 'And at most this fraction of pool depth, so defense cannot be baited into one blockable shot.',
    section: 'defense',
  },

  {
    key: 'genesisPoolEth',
    label: 'Genesis pool ETH',
    group: 'The pool',
    min: 10,
    max: 5_000,
    step: 10,
    unit: 'eth',
    help: 'ETH the team seeds alongside the 100M genesis $STANDARD. Sets the opening price.',
    section: 'supply',
  },
]
