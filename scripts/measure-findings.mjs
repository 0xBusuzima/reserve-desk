/**
 * Measure the sign-versus-size finding and write it where the card generator
 * can read it.
 *
 * make-card.mjs is plain node and cannot import the TypeScript engine, so the
 * numbers are produced here and handed over as JSON. Same rule as the other
 * cards: nothing on a card is typed in by hand.
 *
 *   npx vite-node scripts/measure-findings.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_PARAMS, charterSpread, compareRegimes } from '../src/engine'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'share/findings.json')

const SEEDS = 40
const DAYS = 365

const [chop, bleed] = compareRegimes(DEFAULT_PARAMS, ['chop', 'slow-bleed'], DAYS, SEEDS)

/**
 * The full parameter sweep, so the card quotes the same numbers the write up
 * does. The engine ships a smaller grid for the browser; this is the one that
 * belongs on an image people will screenshot.
 */
const FULL_GRID = []
for (const baseIssuancePerDay of [100_000, 250_000, 600_000])
  for (const mLaunch of [0.3, 0.5, 1.0])
    for (const mMax of [1.5, 2.0, 3.0])
      for (const epochDays of [1, 3])
        for (const rateCut of [0.1, 0.15, 0.25])
          FULL_GRID.push({
            baseIssuancePerDay,
            mLaunch,
            mMax,
            epochDays,
            rateCut,
            rateRaise: Math.min(0.05, rateCut / 2),
          })

const payload = {
  seeds: SEEDS,
  days: DAYS,
  regimes: [chop, bleed].map((r) => ({
    id: r.id,
    label: r.label,
    capitalIn: Math.round(r.realisedEth),
    issued: r.issued,
    meanM: r.meanM,
  })),
  charter: charterSpread(DEFAULT_PARAMS, FULL_GRID, ['melt-up', 'chop', 'slow-bleed', 'bank-run', 'dead-pool'], 365, 3),
  charterGrid: FULL_GRID.length,
  measuredAt: new Date().toISOString(),
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`)

for (const r of payload.regimes) {
  console.log(
    `${r.label.padEnd(14)} capital in ${String(r.capitalIn).padStart(6)} ETH   ` +
      `issued ${(r.issued / 1e6).toFixed(1)}M   avg m ${r.meanM.toFixed(3)}`,
  )
}
console.log(`\nwrote ${OUT}`)
