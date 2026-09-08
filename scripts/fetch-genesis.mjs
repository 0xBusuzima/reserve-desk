#!/usr/bin/env node
/**
 * Read the genesis mint progress off the official site and write it to
 * public/genesis.json.
 *
 * There is no API to call. The protocol is pre launch, nothing is deployed,
 * and the mint page ships the count as a constant compiled into a hashed
 * chunk. So this walks the same path a browser does: fetch the mint page,
 * follow its scripts to the chunk that renders the counter, and read the two
 * props that feed it.
 *
 * The site's own bundle cannot be fetched from a browser on GitHub Pages
 * because it sends no CORS headers, which is why this runs in CI instead and
 * commits the result for the page to read same origin.
 *
 * Usage:
 *   node scripts/fetch-genesis.mjs            write public/genesis.json
 *   node scripts/fetch-genesis.mjs --dry-run  print what it found, write nothing
 */

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'public/genesis.json')

const ORIGIN = 'https://www.standardreserve.xyz'
const MINT_URL = `${ORIGIN}/app/mint/`

/** Refuse anything outside these bounds rather than publish a wrong number. */
const SANE_TOTAL = [1, 1_000_000]
const UA =
  'reserve-desk/1.0 (+https://github.com/0xBusuzima/reserve-desk) genesis mint tracker'

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res.text()
}

/** Absolute URLs for every /assets/*.js referenced in a document or script. */
function assetRefs(text) {
  const out = new Set()
  for (const m of text.matchAll(/["'(/]((?:\/)?assets\/[\w.-]+\.js)/g)) {
    out.add(new URL(m[1].startsWith('/') ? m[1] : `/${m[1]}`, ORIGIN).href)
  }
  return [...out]
}

/**
 * Find the chunk that renders the mint counter.
 *
 * The chunk is lazily imported, so it is not in the page HTML. It is named in
 * the entry bundle, which is. If the name ever changes, fall back to any chunk
 * that actually contains the counter props.
 */
async function findMintChunk() {
  const html = await get(MINT_URL)
  const entries = assetRefs(html)
  if (entries.length === 0) throw new Error('no /assets/*.js referenced by the mint page')

  const seen = new Set(entries)
  const queue = [...entries]
  const candidates = []

  while (queue.length > 0 && candidates.length < 4) {
    const url = queue.shift()
    let body
    try {
      body = await get(url)
    } catch {
      continue
    }
    if (/minted:/.test(body) && /total:/.test(body)) candidates.push({ url, body })
    if (/PrelaunchMint/i.test(body)) {
      for (const ref of assetRefs(body)) {
        if (!seen.has(ref)) {
          seen.add(ref)
          // Named chunks first: they are the likely target.
          if (/PrelaunchMint/i.test(ref)) queue.unshift(ref)
          else queue.push(ref)
        }
      }
    }
  }

  if (candidates.length === 0) throw new Error('no chunk on the mint page exposes minted/total')
  return candidates[0]
}

/**
 * Resolve `minted:` and `total:` to numbers.
 *
 * Minification renames the constants, so the props hold identifiers rather
 * than literals. Every numeric assignment in the chunk is collected and the
 * identifiers are looked up in it. Literals are used directly when present.
 *
 * Note the trap: at the time of writing the chunk reads
 * `const ee=1e3,se=350,te=350` where `te` is an unrelated setTimeout delay
 * that happens to equal the allocated count. Anchoring on the props rather
 * than on a number pattern is what keeps that from mattering.
 */
function readCounts(source) {
  const numbers = new Map()
  for (const m of source.matchAll(/\b([A-Za-z_$][\w$]*)\s*=\s*(\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/g)) {
    if (!numbers.has(m[1])) numbers.set(m[1], Number(m[2]))
  }

  const pick = (prop) => {
    // Prefer the props object that also carries the counter's own label.
    const anchored = new RegExp(
      `countLabel:"[^"]*allocated[^"]*"[\\s\\S]{0,400}?\\b${prop}:([\\w$.]+)`,
    ).exec(source)
    const raw = (anchored ?? new RegExp(`\\b${prop}:([\\w$.]+)`).exec(source))?.[1]
    if (raw === undefined) return undefined
    if (/^[\d.]+(?:e[+-]?\d+)?$/.test(raw)) return Number(raw)
    return numbers.get(raw)
  }

  return { total: pick('total'), allocated: pick('minted') }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const { url, body } = await findMintChunk()
  const { total, allocated } = readCounts(body)

  if (!Number.isFinite(total) || !Number.isFinite(allocated)) {
    throw new Error(`could not resolve counts from ${url} (total=${total}, allocated=${allocated})`)
  }
  if (total < SANE_TOTAL[0] || total > SANE_TOTAL[1]) {
    throw new Error(`total ${total} is outside the plausible range`)
  }
  if (allocated < 0 || allocated > total) {
    throw new Error(`allocated ${allocated} is not within 0..${total}`)
  }

  const next = {
    total,
    allocated,
    checkedAt: new Date().toISOString(),
    source: MINT_URL,
    chunk: url.replace(ORIGIN, ''),
  }

  let prev = null
  try {
    prev = JSON.parse(await readFile(OUT, 'utf8'))
  } catch {
    // First run.
  }

  const changed = !prev || prev.total !== next.total || prev.allocated !== next.allocated
  console.log(
    `${allocated}/${total} allocated  (${((allocated / total) * 100).toFixed(1)}%)  via ${next.chunk}`,
  )
  if (prev) console.log(`previous: ${prev.allocated}/${prev.total} at ${prev.checkedAt}`)
  console.log(changed ? 'count changed' : 'count unchanged')

  if (dryRun) return

  // Only rewrite when the numbers move, so a scheduled run does not produce a
  // commit every time purely because the timestamp advanced.
  if (changed) {
    await writeFile(OUT, `${JSON.stringify(next, null, 2)}\n`)
    console.log(`wrote ${OUT}`)
  }

  if (process.env.GITHUB_OUTPUT) {
    const { appendFile } = await import('node:fs/promises')
    await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`)
    await appendFile(process.env.GITHUB_OUTPUT, `allocated=${allocated}\n`)
    await appendFile(process.env.GITHUB_OUTPUT, `total=${total}\n`)
  }
}

main().catch((err) => {
  console.error(`genesis fetch failed: ${err.message}`)
  process.exit(1)
})
