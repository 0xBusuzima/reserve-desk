/**
 * How much sell pressure can this economy physically express, and when?
 *
 * The whitepaper's own supply identity says circulating supply is
 * 100M + M(t) - B(t), where the 100M is the genesis position locked in the
 * pool and M(t) only grows when a banker withdraws. So at t=0 the entire float
 * IS the pool, and there is nothing outside it to sell.
 *
 * That is not a modelling choice, it is arithmetic. This measures what it
 * implies for the net flow signal, which is the only input the bank has.
 *
 *   npx vite-node scripts/experiment-float.mjs
 */
import { DEFAULT_PARAMS, getScenario, makeCohorts, simulate } from '../src/engine'

const DAYS = 365
const SEEDS = 25
const P = DEFAULT_PARAMS

function run(id, seed) {
  const flows = getScenario(id).generate(DAYS, seed)
  const r = simulate({ params: P, cohorts: makeCohorts(P.foundingCharters), flows })
  return { flows, days: r.days }
}

const pad = (s, n, left = false) => (left ? String(s).padEnd(n) : String(s).padStart(n))

console.log(`\nSell pressure, intended against expressed. ${SEEDS} seeds x ${DAYS} days.\n`)
console.log(
  pad('scenario', 16, true) +
    pad('sells wanted', 14) +
    pad('sells filled', 14) +
    pad('filled %', 11) +
    pad('first day net<0', 17),
)

for (const id of ['bank-run', 'slow-bleed', 'chop', 'dead-pool', 'melt-up']) {
  let wanted = 0
  let filled = 0
  let firstNeg = []

  for (let seed = 1; seed <= SEEDS; seed++) {
    const { flows, days } = run(id, seed)
    for (let i = 0; i < days.length; i++) {
      wanted += flows[i].sellsEth
      // Filled sell value is whatever the buy side did not account for.
      filled += flows[i].buysEth - days[i].netFlowEth
    }
    const idx = days.findIndex((d) => d.netFlowEth < 0)
    firstNeg.push(idx === -1 ? DAYS : idx)
  }

  const meanFirstNeg = firstNeg.reduce((a, b) => a + b, 0) / firstNeg.length
  console.log(
    pad(getScenario(id).label, 16, true) +
      pad(Math.round(wanted / SEEDS), 14) +
      pad(Math.round(filled / SEEDS), 14) +
      pad(`${((filled / wanted) * 100).toFixed(1)}%`, 11) +
      pad(meanFirstNeg >= DAYS ? 'never' : `day ${meanFirstNeg.toFixed(0)}`, 17),
  )
}

// How the float builds, in the harshest case.
console.log('\nFloat outside the pool over time, bank run, seed 1:\n')
const { days } = run('bank-run', 1)
console.log(pad('day', 8, true) + pad('circulating', 14) + pad('in pool', 14) + pad('tradable', 14) + pad('% tradable', 13))
for (const d of [0, 30, 60, 73, 90, 180, 364]) {
  const s = days[d]
  const tradable = Math.max(0, s.circulating - s.poolStd)
  console.log(
    pad(`d${d}`, 8, true) +
      pad((s.circulating / 1e6).toFixed(1) + 'M', 14) +
      pad((s.poolStd / 1e6).toFixed(1) + 'M', 14) +
      pad((tradable / 1e6).toFixed(2) + 'M', 14) +
      pad(((tradable / s.circulating) * 100).toFixed(1) + '%', 13),
  )
}
