/**
 * What is one Founding Charter actually worth?
 *
 * The absolute token number is unknowable while the launch parameters are
 * unpublished. The *share* is not. A charter's claim on issuance is its
 * branches divided by every branch in the system, and that ratio survives
 * almost any choice of base rate, multiplier band or epoch length.
 *
 * So this sweeps the unpublished parameters rather than picking values, and
 * reports the one thing that stays stable across all of them: what expanding
 * is worth against sitting still.
 *
 *   npx vite-node scripts/experiment-charter.mjs
 */
import { DEFAULT_PARAMS, SCENARIOS, getScenario, makeCohorts, simulate } from '../src/engine'

const DAYS = 365

/** Plausible values for the numbers the whitepaper holds back. */
const SWEEP = {
  baseIssuancePerDay: [100_000, 250_000, 600_000],
  mLaunch: [0.3, 0.5, 1.0],
  mMax: [1.5, 2.0, 3.0],
  epochDays: [1, 3],
  rateCut: [0.1, 0.15, 0.25],
}

function* grid() {
  for (const base of SWEEP.baseIssuancePerDay)
    for (const mLaunch of SWEEP.mLaunch)
      for (const mMax of SWEEP.mMax)
        for (const epochDays of SWEEP.epochDays)
          for (const rateCut of SWEEP.rateCut)
            yield {
              ...DEFAULT_PARAMS,
              baseIssuancePerDay: base,
              mLaunch,
              mMax,
              epochDays,
              rateCut,
              rateRaise: Math.min(0.05, rateCut / 2),
            }
}

const rows = []

for (const params of grid()) {
  for (const s of SCENARIOS) {
    for (let seed = 1; seed <= 3; seed++) {
      const flows = getScenario(s.id).generate(DAYS, seed)
      const r = simulate({ params, cohorts: makeCohorts(params.foundingCharters), flows })

      const compounders = r.cohorts.find((c) => c.id === 'compound')
      const holders = r.cohorts.find((c) => c.id === 'hold')
      if (!compounders || !holders) continue

      const startCompound = makeCohorts(params.foundingCharters).find((c) => c.id === 'compound')
      const startHold = makeCohorts(params.foundingCharters).find((c) => c.id === 'hold')

      const perCompounder = compounders.netTokens / Math.max(1, startCompound.charters)
      const perHolder = holders.netTokens / Math.max(1, startHold.charters)
      if (perHolder <= 0) continue

      rows.push({
        scenario: s.label,
        ratio: perCompounder / perHolder,
        endBranches: r.days[r.days.length - 1].branches,
        compounderBranches: compounders.branches / Math.max(1, startCompound.charters),
      })
    }
  }
}

const pct = (a, q) => {
  const sorted = [...a].sort((x, y) => x - y)
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
}

const ratios = rows.map((r) => r.ratio)
const branches = rows.map((r) => r.endBranches)

console.log(`\n${rows.length} runs: ${[...grid()].length} parameter sets x 5 scenarios x 3 seeds\n`)
console.log('Expanding against holding, in tokens earned per charter over one year:')
console.log(`  worst case   ${pct(ratios, 0).toFixed(2)}x`)
console.log(`  10th pct     ${pct(ratios, 0.1).toFixed(2)}x`)
console.log(`  median       ${pct(ratios, 0.5).toFixed(2)}x`)
console.log(`  90th pct     ${pct(ratios, 0.9).toFixed(2)}x`)
console.log(`  best case    ${pct(ratios, 0.999).toFixed(2)}x`)
console.log(`\n  never worse than holding: ${((ratios.filter((r) => r >= 1).length / ratios.length) * 100).toFixed(1)}% of runs`)

console.log(`\nSystem branch count after a year (starts at 1,000):`)
console.log(`  median ${Math.round(pct(branches, 0.5))}   10th ${Math.round(pct(branches, 0.1))}   90th ${Math.round(pct(branches, 0.9))}`)

console.log(`\nBy scenario, median expanding vs holding:`)
for (const s of SCENARIOS) {
  const sub = rows.filter((r) => r.scenario === s.label).map((r) => r.ratio)
  if (sub.length) console.log(`  ${s.label.padEnd(16)} ${pct(sub, 0.5).toFixed(2)}x`)
}
