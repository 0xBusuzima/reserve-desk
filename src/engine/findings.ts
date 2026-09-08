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
