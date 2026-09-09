import { DEFAULT_PARAMS } from './params'
import { getScenario } from './scenarios'
import { makeCohorts, simulate } from './simulate'
import type { Params } from './types'

/**
 * Path dependence in the policy multiplier.
 *
 * Section 5 says cuts are immediate and raises must be earned, and draws the
 * multiplier as discrete per epoch steps. Equation 5.2 itself is not
 * published. Any rule with those two properties and a fixed step size is path
 * dependent rather than level dependent: what the multiplier ends up at
 * depends on the order the epochs arrived in, not on where capital netted out.
 *
 * The consequence is worth measuring rather than asserting. A market that
 * oscillates around zero never banks a raise, because every up leg is earned
 * one step at a time and every down leg is given back at once. A market that
 * trends and then breaks keeps most of the ladder it climbed.
 *
 * This runs both regimes over many seeds so the comparison is a distribution
 * and not one lucky draw.
 */
export interface RegimeSummary {
  id: string
  label: string
  /** Mean net ETH flow the scenario asked for. */
  intendedEth: number
  /**
   * Mean net ETH flow the bank actually saw. Sells are capped at the float
   * outside the pool, so early on a scenario cannot always express the
   * outflow it wants, and this is the number policy actually reads.
   */
  realisedEth: number
  /** Mean cumulative issuance. */
  issued: number
  /** Mean multiplier, averaged over every day. */
  meanM: number
}

export function compareRegimes(
  params: Params = DEFAULT_PARAMS,
  ids: string[] = ['chop', 'slow-bleed'],
  days = 365,
  seeds = 20,
): RegimeSummary[] {
  return ids.map((id) => {
    const scenario = getScenario(id)
    let intendedEth = 0
    let realisedEth = 0
    let issued = 0
    let meanM = 0

    for (let seed = 1; seed <= seeds; seed++) {
      const flows = scenario.generate(days, seed)
      const r = simulate({
        params,
        cohorts: makeCohorts(params.foundingCharters),
        flows,
      })
      const last = r.days[r.days.length - 1]
      issued += last.issuedCumulative
      meanM += r.days.reduce((a, d) => a + d.m, 0) / r.days.length
      intendedEth += flows.reduce((a, f) => a + f.buysEth - f.sellsEth, 0)
      realisedEth += r.days.reduce((a, d) => a + d.netFlowEth, 0)
    }

    return {
      id,
      label: scenario.label,
      intendedEth: intendedEth / seeds,
      realisedEth: realisedEth / seeds,
      issued: issued / seeds,
      meanM: meanM / seeds,
    }
  })
}

/**
 * What one Founding Charter is worth, expressed the only way it can honestly
 * be expressed before launch.
 *
 * The absolute token count depends entirely on numbers the whitepaper holds
 * back. The ratio between expanding and sitting still does not: a charter's
 * claim on issuance is its branches over every branch in the system, and the
 * cap of ten branches per charter bounds the spread no matter what the base
 * rate turns out to be.
 *
 * So this sweeps the unpublished parameters instead of picking values, and
 * reports the spread that survives all of them.
 */
export interface CharterSpread {
  /** Simulations behind the numbers. */
  runs: number
  /** Expanding against holding, in tokens per charter after a year. */
  worst: number
  median: number
  best: number
  /** Share of runs where expanding was at least as good as holding. */
  everBeatenPct: number
  /** Median total branches in the system after a year. Starts at 1,000. */
  medianBranches: number
}

/** A small grid, sized to run inside a browser frame without blocking. */
const BROWSER_GRID: Partial<Params>[] = [
  { baseIssuancePerDay: 100_000, mLaunch: 0.3, mMax: 1.5 },
  { baseIssuancePerDay: 250_000, mLaunch: 0.5, mMax: 2.0 },
  { baseIssuancePerDay: 600_000, mLaunch: 1.0, mMax: 3.0 },
  { baseIssuancePerDay: 250_000, mLaunch: 0.5, mMax: 2.0, epochDays: 3 },
  { baseIssuancePerDay: 250_000, mLaunch: 0.5, mMax: 2.0, rateCut: 0.25 },
]

export function charterSpread(
  base: Params = DEFAULT_PARAMS,
  grid: Partial<Params>[] = BROWSER_GRID,
  scenarioIds: string[] = ['melt-up', 'chop', 'slow-bleed'],
  days = 365,
  seeds = 1,
): CharterSpread {
  const ratios: number[] = []
  const branchCounts: number[] = []
  const cohorts = makeCohorts(base.foundingCharters)
  const startCompound = cohorts.find((c) => c.id === 'compound')?.charters ?? 1
  const startHold = cohorts.find((c) => c.id === 'hold')?.charters ?? 1

  for (const patch of grid) {
    const params: Params = { ...base, ...patch }
    for (const id of scenarioIds) {
      for (let seed = 1; seed <= seeds; seed++) {
        const flows = getScenario(id).generate(days, seed)
        const r = simulate({ params, cohorts: makeCohorts(params.foundingCharters), flows })

        const compound = r.cohorts.find((c) => c.id === 'compound')
        const hold = r.cohorts.find((c) => c.id === 'hold')
        if (!compound || !hold) continue

        const perCompounder = compound.netTokens / startCompound
        const perHolder = hold.netTokens / startHold
        if (perHolder <= 0) continue

        ratios.push(perCompounder / perHolder)
        branchCounts.push(r.days[r.days.length - 1].branches)
      }
    }
  }

  const q = (a: number[], p: number) => {
    if (a.length === 0) return 0
    const s = [...a].sort((x, y) => x - y)
    return s[Math.min(s.length - 1, Math.floor(p * s.length))]
  }

  return {
    runs: ratios.length,
    worst: q(ratios, 0),
    median: q(ratios, 0.5),
    best: q(ratios, 0.999),
    everBeatenPct: ratios.length
      ? (ratios.filter((r) => r >= 1).length / ratios.length) * 100
      : 0,
    medianBranches: q(branchCounts, 0.5),
  }
}
