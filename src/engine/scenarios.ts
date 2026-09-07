import { rng } from './math'
import type { DayFlow, Scenario } from './types'

/**
 * Scenarios are gross ETH flow generators. The whitepaper is explicit that
 * net flow is the bank's only input, so a scenario is the entire exogenous
 * world: everything else the simulation produces itself.
 *
 * Each generator returns `days` entries of { buysEth, sellsEth }. Gross
 * matters as well as net, because trading fees are charged on both sides.
 */

function noisy(rand: () => number, base: number, jitter: number): number {
  return Math.max(0, base * (1 + jitter * (rand() * 2 - 1)))
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'melt-up',
    label: 'Launch melt-up',
    description:
      'Heavy two-sided volume with buys dominating, decaying into a calmer trend. The case the expansion flywheel is designed for: issuance climbs to the ceiling, fees stack hard reserves, and licenses reprice upward every day.',
    generate(days, seed) {
      const rand = rng(seed)
      const out: DayFlow[] = []
      for (let d = 0; d < days; d++) {
        const heat = Math.exp(-d / 45)
        const buys = noisy(rand, 40 + 260 * heat, 0.45)
        const sells = noisy(rand, 30 + 120 * heat, 0.5)
        out.push({ buysEth: buys, sellsEth: sells })
      }
      return out
    },
  },
  {
    id: 'slow-bleed',
    label: 'Slow bleed',
    description:
      'Sells persistently edge out buys on thinning volume. No single dramatic day, just a signal that never turns positive. Tests whether the asymmetric multiplier and the contraction vault can hold a floor without a crisis to react to.',
    generate(days, seed) {
      const rand = rng(seed)
      const out: DayFlow[] = []
      for (let d = 0; d < days; d++) {
        const decay = Math.exp(-d / 120)
        const buys = noisy(rand, 45 * decay, 0.5)
        const sells = noisy(rand, 62 * decay, 0.5)
        out.push({ buysEth: buys, sellsEth: sells })
      }
      return out
    },
  },
  {
    id: 'bank-run',
    label: 'Bank run',
    description:
      'Sixty calm days, then a violent one-week exodus: sells spike an order of magnitude while buys evaporate. This is the scenario section 9 exists for. Watch the resolution fee, and watch who ends up holding what.',
    generate(days, seed) {
      const rand = rng(seed)
      const out: DayFlow[] = []
      for (let d = 0; d < days; d++) {
        const inRun = d >= 60 && d < 74
        const panic = inRun ? Math.exp(-(d - 60) / 5) : 0
        const buys = noisy(rand, inRun ? 12 : 70, 0.4)
        const sells = noisy(rand, 60 + 900 * panic, 0.35)
        out.push({ buysEth: buys, sellsEth: sells })
      }
      return out
    },
  },
  {
    id: 'chop',
    label: 'Chop',
    description:
      'Net flow oscillates around zero on a two-week cycle. The most likely real regime, and the one that punishes an asymmetric multiplier hardest: every up-leg is earned a step at a time and every down-leg gives it back at once.',
    generate(days, seed) {
      const rand = rng(seed)
      const out: DayFlow[] = []
      for (let d = 0; d < days; d++) {
        const cycle = Math.sin((d / 14) * Math.PI * 2)
        const buys = noisy(rand, 80 + 35 * cycle, 0.55)
        const sells = noisy(rand, 80 - 35 * cycle, 0.55)
        out.push({ buysEth: buys, sellsEth: sells })
      }
      return out
    },
  },
  {
    id: 'dead-pool',
    label: 'Dead pool',
    description:
      'Volume collapses to near nothing and stays there. No run, no rally, no fees. The quiet failure mode: with almost no ETH entering the fee engine, the bank has nothing to buy reserves with and nothing to defend with.',
    generate(days, seed) {
      const rand = rng(seed)
      const out: DayFlow[] = []
      for (let d = 0; d < days; d++) {
        const decay = Math.exp(-d / 25)
        const buys = noisy(rand, 2 + 120 * decay, 0.7)
        const sells = noisy(rand, 3 + 130 * decay, 0.7)
        out.push({ buysEth: buys, sellsEth: sells })
      }
      return out
    },
  },
]

export function getScenario(id: string): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0]
}
