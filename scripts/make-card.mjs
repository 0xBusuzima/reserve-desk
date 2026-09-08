#!/usr/bin/env node
/**
 * Render share cards at 1600x900 and screenshot them with whatever Chromium is
 * already on the machine. Output lands in share/ at 2x for a crisp timeline
 * image.
 *
 * Both cards read their numbers from the project rather than from constants
 * typed in here: the genesis card from public/genesis.json, the redaction card
 * from the provenance table in src/engine/params.ts. Neither can drift away
 * from what the site says.
 *
 * Usage:
 *   node scripts/make-card.mjs                 render every card
 *   node scripts/make-card.mjs --card genesis  render one
 *   node scripts/make-card.mjs --html-only     write the HTML, skip the render
 */

import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(ROOT, 'share')

const WIDTH = 1600
const HEIGHT = 900
/** Squares in the charter grid. Each one stands for five charters. */
const COLS = 40
const ROWS = 5

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

const nf = new Intl.NumberFormat('en-US')

// ---------------------------------------------------------------------------
// Shared chrome
// ---------------------------------------------------------------------------

const BASE_CSS = `
  :root {
    --bg:#08090a; --panel:#0e1012; --line:#23282d; --line-soft:#191d21;
    --ink:#e8eaed; --ink-2:#9aa3ac; --ink-3:#5f686f;
    --gold:#d9a441; --gold-dim:#6b5322; --green:#4fb286;
    --mono:'Consolas','SF Mono','JetBrains Mono',ui-monospace,monospace;
    --sans:'Segoe UI',-apple-system,system-ui,sans-serif;
  }
  * { box-sizing:border-box; margin:0; padding:0; }
  html,body { width:${WIDTH}px; height:${HEIGHT}px; }
  body {
    background:var(--bg); color:var(--ink); font-family:var(--sans);
    padding:58px 64px 52px; display:flex; flex-direction:column;
    -webkit-font-smoothing:antialiased;
  }
  header { display:flex; align-items:center; justify-content:space-between; }
  .brand { display:flex; align-items:center; gap:14px; }
  .glyph {
    width:38px; height:38px; border:1.5px solid var(--gold); border-radius:3px;
    display:grid; place-items:center; color:var(--gold);
    font-family:var(--mono); font-size:21px; font-weight:700;
  }
  .word { font-size:19px; letter-spacing:.22em; font-weight:600; }
  .eyebrow {
    font-family:var(--mono); font-size:14px; letter-spacing:.16em;
    color:var(--ink-3); text-transform:uppercase;
  }
  hr { border:0; border-top:1px solid var(--line); margin:30px 0 0; }
  footer {
    margin-top:auto; padding-top:30px; border-top:1px solid var(--line);
    display:flex; align-items:center; justify-content:space-between;
    font-family:var(--mono); font-size:14.5px; color:var(--ink-3);
  }
  footer .url { color:var(--gold); }
`

function page({ eyebrow, css, body, footL }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>${BASE_CSS}${css}</style></head><body>
  <header>
    <div class="brand"><div class="glyph">§</div><div class="word">RESERVE DESK</div></div>
    <div class="eyebrow">${eyebrow}</div>
  </header>
  <hr>
${body}
  <footer>
    <div>${footL}</div>
    <div class="url">0xbusuzima.github.io/reserve-desk</div>
  </footer>
</body></html>`
}

// ---------------------------------------------------------------------------
// Card 1: genesis mint progress
// ---------------------------------------------------------------------------

async function genesisCard() {
  const { total, allocated, checkedAt } = JSON.parse(
    await readFile(resolve(ROOT, 'public/genesis.json'), 'utf8'),
  )
  const squares = COLS * ROWS
  const taken = Math.round((allocated / total) * squares)
  const pctText = `${((allocated / total) * 100).toFixed(1)}%`
  const date = new Date(checkedAt)
  const stamp = Number.isFinite(date.getTime())
    ? `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`
    : checkedAt

  const grid = Array.from(
    { length: squares },
    (_, i) => `<i${i < taken ? ' class="taken"' : ''}></i>`,
  ).join('')

  return page({
    eyebrow: 'Genesis mint · whitepaper §6',
    footL: `Each square is five charters · read from the official mint page ${stamp}`,
    css: `
  .headline { margin-top:50px; display:flex; align-items:flex-end; gap:34px; }
  .figure { font-family:var(--mono); font-size:132px; line-height:.9; color:var(--gold); font-weight:700; letter-spacing:-.02em; }
  .of { font-family:var(--mono); font-size:44px; line-height:1; color:var(--ink-3); font-weight:600; padding-bottom:6px; }
  .caption { padding-bottom:12px; }
  .caption .big { font-size:27px; font-weight:600; letter-spacing:-.01em; }
  .caption .small { font-size:16px; color:var(--ink-2); margin-top:5px; }
  .stats { margin-top:52px; display:grid; grid-template-columns:repeat(3,1fr); gap:18px; }
  .stat { background:var(--panel); border:1px solid var(--line-soft); border-radius:7px; padding:19px 22px; }
  .stat .k { font-family:var(--mono); font-size:12.5px; letter-spacing:.15em; color:var(--ink-3); text-transform:uppercase; }
  .stat .v { font-family:var(--mono); font-size:35px; font-weight:700; margin-top:9px; }
  .stat .f { font-size:14px; color:var(--ink-2); margin-top:6px; }
  .v.green { color:var(--green); }
  .v.gold { color:var(--gold); }
  .bar { margin-top:46px; height:9px; border-radius:5px; background:var(--line-soft); border:1px solid var(--line); overflow:hidden; }
  .bar > span { display:block; height:100%; width:${pctText}; background:linear-gradient(90deg,#b8862f,var(--gold)); }
  .grid { margin-top:18px; display:grid; grid-template-columns:repeat(${COLS},1fr); gap:7px; }
  /* Unallocated seats are drawn as real cells, not gaps. The block has to read
     as 200 charters of which most are still open, not as empty space. */
  .grid i { aspect-ratio:1; border-radius:2px; background:#171b1f; border:1px solid #262b30; }
  .grid i.taken { background:var(--gold); border-color:var(--gold); }`,
    body: `
  <div class="headline">
    <div class="figure">${nf.format(allocated)}</div>
    <div class="of">/ ${nf.format(total)}</div>
    <div class="caption">
      <div class="big">Founding Charters allocated</div>
      <div class="small">Free, one per wallet. The only way into the economy that costs nothing.</div>
    </div>
  </div>
  <div class="stats">
    <div class="stat">
      <div class="k">Remaining</div>
      <div class="v green">${nf.format(total - allocated)}</div>
      <div class="f">allowlist plus open mint</div>
    </div>
    <div class="stat">
      <div class="k">Progress</div>
      <div class="v gold">${pctText}</div>
      <div class="f">of the genesis cohort</div>
    </div>
    <div class="stat">
      <div class="k">One charter is</div>
      <div class="v">${((1 / total) * 100).toFixed(2)}%</div>
      <div class="f">of all seats, before auctions dilute the count</div>
    </div>
  </div>
  <div class="bar"><span></span></div>
  <div class="grid">${grid}</div>`,
  })
}

// ---------------------------------------------------------------------------
// Card 2: what the whitepaper leaves blank
// ---------------------------------------------------------------------------

/**
 * Pull the provenance table and the control labels straight out of the engine
 * source, so the card cannot claim a count the code disagrees with.
 */
async function readProvenance() {
  const src = await readFile(resolve(ROOT, 'src/engine/params.ts'), 'utf8')

  const table = /export const PROVENANCE[^{]*\{([\s\S]*?)\n\}/.exec(src)
  if (!table) throw new Error('could not find PROVENANCE in params.ts')

  const entries = [...table[1].matchAll(/(\w+):\s*'(\w+)'/g)].map((m) => [m[1], m[2]])
  if (entries.length === 0) throw new Error('PROVENANCE parsed empty')

  const labels = new Map(
    [...src.matchAll(/\{\s*key:\s*'(\w+)',\s*label:\s*'([^']+)'/g)].map((m) => [m[1], m[2]]),
  )

  const count = (kind) => entries.filter(([, v]) => v === kind).length
  const redacted = entries
    .filter(([, v]) => v === 'assumed')
    .map(([k]) => labels.get(k) ?? k.replace(/([A-Z])/g, ' $1').toLowerCase())

  return {
    total: entries.length,
    stated: count('whitepaper'),
    derived: count('derived'),
    redacted,
  }
}

async function redactionCard() {
  const { total, stated, derived, redacted } = await readProvenance()
  const chips = redacted
    .map((label) => `<span class="chip">${label}<i class="blank"></i></span>`)
    .join('')

  // One segment per parameter, in provenance order, so the split is legible
  // as a proportion rather than only as two numbers.
  const segs = [
    ...Array(stated).fill('on'),
    ...Array(derived).fill('mid'),
    ...Array(redacted.length).fill('off'),
  ]
    .map((k) => `<i class="${k}"></i>`)
    .join('')

  return page({
    eyebrow: 'What is actually known · whitepaper §14',
    footL: `${total} parameters this model needs · ${stated} stated, ${derived} derived, ${redacted.length} still unpublished`,
    css: `
  .lede { margin-top:46px; max-width:1200px; }
  .lede h1 { font-size:41px; line-height:1.16; font-weight:600; letter-spacing:-.015em; }
  .lede h1 em { font-style:normal; color:var(--gold); }
  .counts { margin-top:46px; display:flex; align-items:flex-end; gap:52px; }
  .count .n { font-family:var(--mono); font-size:78px; line-height:.9; font-weight:700; }
  .count .l { font-family:var(--mono); font-size:13px; letter-spacing:.16em; text-transform:uppercase; color:var(--ink-3); margin-top:12px; }
  .count.on .n { color:var(--green); }
  .count.off .n { color:var(--gold); }
  .segs { flex:1; display:flex; gap:4px; padding-bottom:14px; }
  .segs i { flex:1; height:38px; border-radius:2px; }
  .segs i.on  { background:#254a3a; border:1px solid #2f6049; }
  .segs i.mid { background:#1e2226; border:1px solid #2b3137; }
  .segs i.off { background:var(--gold); border:1px solid var(--gold); }
  .chips { margin-top:42px; display:flex; flex-wrap:wrap; gap:11px; }
  .chip {
    display:inline-flex; align-items:center; gap:12px;
    background:var(--panel); border:1px solid var(--line); border-radius:6px;
    padding:13px 17px; font-size:17px; color:var(--ink-2);
  }
  /* The blank is the point of the card: the number that should be here is not. */
  .blank { display:inline-block; width:58px; height:17px; border-bottom:2px dashed var(--gold-dim); }
  .quote { margin-top:38px; font-family:var(--mono); font-size:17px; color:var(--ink-2); }
  .quote span { color:var(--ink-3); }
  .payoff { margin-top:15px; font-size:19px; color:var(--ink); }
  .payoff b { color:var(--gold); font-weight:600; }`,
    body: `
  <div class="lede">
    <h1>The mechanism is fully specified. The launch numbers<br>are held back, so <em>the numbers are the part you set</em>.</h1>
  </div>
  <div class="counts">
    <div class="count on"><div class="n">${stated}</div><div class="l">stated outright</div></div>
    <div class="count off"><div class="n">${redacted.length}</div><div class="l">still unpublished</div></div>
    <div class="segs">${segs}</div>
  </div>
  <div class="chips">${chips}</div>
  <div class="quote">"Final parameters will be announced closer to launch."<span> whitepaper §14</span></div>
  <div class="payoff">None of these are <b>a guess at what the team will choose</b>. They are yours to set, and the model runs the economy day by day on whatever you pick.</div>`,
  })
}

// ---------------------------------------------------------------------------

const CARDS = { genesis: genesisCard, redaction: redactionCard }

async function render(name, html) {
  const htmlPath = resolve(OUT_DIR, `${name}-card.html`)
  const pngPath = resolve(OUT_DIR, `${name}-card.png`)
  await writeFile(htmlPath, html)
  console.log(`wrote ${htmlPath}`)

  if (process.argv.includes('--html-only')) return

  const browser = BROWSERS.find((b) => existsSync(b))
  if (!browser) {
    console.error('no Chromium found; open the HTML and screenshot it by hand')
    process.exit(1)
  }

  await run(browser, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    `--window-size=${WIDTH},${HEIGHT}`,
    `--screenshot=${pngPath}`,
    pathToFileURL(htmlPath).href,
  ])
  console.log(`wrote ${pngPath}  (${WIDTH * 2}x${HEIGHT * 2})`)
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const i = process.argv.indexOf('--card')
  const wanted = i >= 0 ? [process.argv[i + 1]] : Object.keys(CARDS)

  for (const name of wanted) {
    const build = CARDS[name]
    if (!build) throw new Error(`unknown card "${name}"; try ${Object.keys(CARDS).join(', ')}`)
    await render(name, await build())
  }
}

main().catch((err) => {
  console.error(`card render failed: ${err.message}`)
  process.exit(1)
})
