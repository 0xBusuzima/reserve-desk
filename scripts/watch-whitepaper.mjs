#!/usr/bin/env node
/**
 * Watch the whitepaper's launch parameter table and record whether it is still
 * redacted.
 *
 * Section 14 currently renders every value as a blank bar: the table rows are
 * pairs of a label and a pixel width, fed to a redaction component, and the
 * section closes with "Final parameters will be announced closer to launch."
 * The team has said more detail is coming before the 14th, so the moment those
 * rows turn into real values this project stops guessing and starts quoting.
 *
 * Runs beside the genesis tracker on the same schedule and writes
 * public/whitepaper.json for the site to read.
 *
 * Usage:
 *   node scripts/watch-whitepaper.mjs
 *   node scripts/watch-whitepaper.mjs --dry-run
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'public/whitepaper.json')

const ORIGIN = 'https://www.standardreserve.xyz'
const PAGE = `${ORIGIN}/whitepaper/`
const UA = 'reserve-desk/1.0 (+https://github.com/0xBusuzima/reserve-desk) whitepaper watch'

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res.text()
}

/**
 * Read the launch table out of the bundle.
 *
 * A redacted row is `["Hard cap", 16]`, where the number is the width of the
 * bar that stands in for the value. A published one will not be a bare number,
 * so the shape of the second element is the signal, not its content.
 */
function readTable(js) {
  const block = /\[\["Hard cap",[\s\S]{0,1200}?\]\]/.exec(js)
  if (!block) return null

  const rows = [...block[0].matchAll(/\["([^"]+)",([^\],]+)\]/g)].map(([, label, raw]) => ({
    label,
    raw: raw.trim(),
    redacted: /^\d+(\.\d+)?$/.test(raw.trim()),
  }))
  return rows.length > 0 ? rows : null
}

async function main() {
  const html = await get(PAGE)
  const asset = /assets\/whitepaper-[A-Za-z0-9_-]+\.js/.exec(html)
  if (!asset) throw new Error('could not find the whitepaper bundle')

  const js = await get(`${ORIGIN}/${asset[0]}`)
  const rows = readTable(js)
  if (!rows) throw new Error('could not find the launch parameter table')

  const stillPromised = js.includes('Final parameters will be announced closer to launch')
  const redactedCount = rows.filter((r) => r.redacted).length
  const published = rows.filter((r) => !r.redacted).map((r) => r.label)

  const next = {
    /** True while every launch value is still a blank bar. */
    redacted: redactedCount === rows.length,
    parameters: rows.length,
    redactedCount,
    publishedLabels: published,
    stillPromised,
    bundle: asset[0],
    checkedAt: new Date().toISOString(),
    source: PAGE,
  }

  let prev = null
  try {
    prev = JSON.parse(await readFile(OUT, 'utf8'))
  } catch {
    // First run.
  }

  const changed =
    !prev || prev.redactedCount !== next.redactedCount || prev.redacted !== next.redacted

  console.log(
    `${redactedCount}/${rows.length} launch values still redacted` +
      (published.length ? `; published: ${published.join(', ')}` : ''),
  )
  console.log(`bundle ${asset[0]}`)
  console.log(changed ? 'STATUS CHANGED' : 'status unchanged')

  if (process.argv.includes('--dry-run')) return

  // The bundle hash moves on every rebuild, so only a change in what is
  // actually redacted is worth a commit.
  if (changed) {
    await mkdir(dirname(OUT), { recursive: true })
    await writeFile(OUT, `${JSON.stringify(next, null, 2)}\n`)
    console.log(`wrote ${OUT}`)
  }

  if (process.env.GITHUB_OUTPUT) {
    const { appendFile } = await import('node:fs/promises')
    await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`)
    await appendFile(process.env.GITHUB_OUTPUT, `redacted=${next.redacted}\n`)
    await appendFile(process.env.GITHUB_OUTPUT, `redactedCount=${redactedCount}\n`)
  }
}

main().catch((err) => {
  console.error(`whitepaper watch failed: ${err.message}`)
  process.exit(1)
})
