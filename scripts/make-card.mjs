#!/usr/bin/env node
/**
 * Render a share card for the genesis mint.
 *
 * Reads public/genesis.json so the card can never disagree with the site, lays
 * it out at 1600x900, and screenshots it with whatever Chromium is already on
 * the machine. Output lands in share/genesis-card.png at 2x for a crisp
 * timeline image.
 *
 * Usage:
 *   node scripts/make-card.mjs
 *   node scripts/make-card.mjs --html-only    write the HTML, skip the render
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
const HTML = resolve(OUT_DIR, 'genesis-card.html')
const PNG = resolve(OUT_DIR, 'genesis-card.png')

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

function card({ total, allocated, checkedAt }) {
  const squares = COLS * ROWS
  const taken = Math.round((allocated / total) * squares)
  const pctText = `${((allocated / total) * 100).toFixed(1)}%`
  const date = new Date(checkedAt)
  const stamp = Number.isFinite(date.getTime())
    ? date.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
    : checkedAt

  const grid = Array.from(
    { length: squares },
    (_, i) => `<i${i < taken ? ' class="taken"' : ''}></i>`,
  ).join('')

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
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
     as 200 charters of which 130 are still open, rather than as empty space. */
  .grid i { aspect-ratio:1; border-radius:2px; background:#171b1f; border:1px solid #262b30; }
  .grid i.taken { background:var(--gold); border-color:var(--gold); }

  footer {
    margin-top:auto; padding-top:30px; border-top:1px solid var(--line);
    display:flex; align-items:center; justify-content:space-between;
    font-family:var(--mono); font-size:14.5px; color:var(--ink-3);
  }
  footer .url { color:var(--gold); }
</style></head><body>
  <header>
    <div class="brand"><div class="glyph">§</div><div class="word">RESERVE DESK</div></div>
    <div class="eyebrow">Genesis mint · whitepaper §6</div>
  </header>
  <hr>

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
  <div class="grid">${grid}</div>

  <footer>
    <div>Each square is five charters · read from the official mint page ${stamp}</div>
    <div class="url">0xbusuzima.github.io/reserve-desk</div>
  </footer>
</body></html>`
}

async function main() {
  const genesis = JSON.parse(await readFile(resolve(ROOT, 'public/genesis.json'), 'utf8'))
  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(HTML, card(genesis))
  console.log(`wrote ${HTML}`)

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
    `--screenshot=${PNG}`,
    pathToFileURL(HTML).href,
  ])

  console.log(`wrote ${PNG}  (${WIDTH * 2}x${HEIGHT * 2}, ${genesis.allocated}/${genesis.total})`)
}

main().catch((err) => {
  console.error(`card render failed: ${err.message}`)
  process.exit(1)
})
