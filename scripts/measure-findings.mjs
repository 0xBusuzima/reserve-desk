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
  charter: charterSpread(DEFAULT_PARAMS),
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
