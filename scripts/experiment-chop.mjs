/**
 * Does chop really punish a banker harder than a steady bleed?
 *
 * Reports both the flow the scenario asked for and the flow the bank actually
 * saw, because sells are capped at the float outside the pool and the two can
 * disagree sharply while the float is thin.
 *
 *   npx vite-node scripts/experiment-chop.mjs
 */
import { DEFAULT_PARAMS, SCENARIOS, compareRegimes } from '../src/engine'

const ids = SCENARIOS.map((s) => s.id)
const rows = compareRegimes(DEFAULT_PARAMS, ids, 365, 40)
rows.sort((a, b) => a.issued - b.issued)

const pad = (s, n, left = false) => (left ? String(s).padEnd(n) : String(s).padStart(n))
console.log('\n40 seeds x 365 days, default parameters\n')
console.log(pad('scenario', 16, true) + pad('avg m', 10) + pad('issued M', 12) + pad('intended ETH', 15) + pad('realised ETH', 15))
for (const r of rows) {
  console.log(
    pad(r.label, 16, true) +
      pad(r.meanM.toFixed(3), 10) +
      pad((r.issued / 1e6).toFixed(1), 12) +
      pad(r.intendedEth.toFixed(0), 15) +
      pad(r.realisedEth.toFixed(0), 15),
  )
}
