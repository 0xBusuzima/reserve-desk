import { useCallback, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_PARAMS,
  PARAM_META,
  PROVENANCE,
  SCENARIOS,
  getScenario,
  issuanceBudget,
  makeCohorts,
  simulate,
} from './engine'
import type { Params } from './engine'
import { GENESIS_ALLOCATED, GENESIS_CHECKED, GENESIS_TOTAL, LINKS } from './config'
import { Chart } from './ui/Chart'
import { ParamControls } from './ui/Controls'
import { Desk, Stat } from './ui/Desk'
import { compact, eth, int, pct, price as fmtPrice, signed } from './ui/format'

const HORIZONS = [90, 180, 365, 730, 1095]

export default function App() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS)
  const [scenarioId, setScenarioId] = useState('chop')
  const [horizon, setHorizon] = useState(365)
  const [seed, setSeed] = useState(7)
  const [flash, setFlash] = useState<string | null>(null)

  const scenario = getScenario(scenarioId)

  const result = useMemo(() => {
    const flows = scenario.generate(horizon, seed)
    return simulate({ params, cohorts: makeCohorts(params.foundingCharters), flows })
  }, [params, scenario, horizon, seed])

  const D = result.days
  const last = D[D.length - 1]
  const patch = (p: Partial<Params>) => setParams((prev) => ({ ...prev, ...p }))

  /**
   * Take the reader to the part of the page a control actually moves.
   *
   * It fires once per control rather than on every tick of a drag: if you are
   * already looking at the right section, dragging the slider leaves the view
   * alone so the chart can be watched while it redraws.
   */
  const lastSection = useRef<string | null>(null)
  const flashTimer = useRef<number | undefined>(undefined)
  const focusSection = useCallback((id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    const box = el.getBoundingClientRect()
    const alreadyThere = box.top > -40 && box.top < window.innerHeight * 0.45
    if (lastSection.current === id && alreadyThere) return
    lastSection.current = id

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })

    setFlash(id)
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(null), 1100)
  }, [])

  const cls = (id: string) => (flash === id ? 'flash' : undefined)

  const contractionBands = useMemo(() => {
    const out: { from: number; to: number; color: string }[] = []
    let start: number | null = null
    D.forEach((d, i) => {
      if (d.regime === 'contraction' && start === null) start = i
      if (d.regime === 'expansion' && start !== null) {
        out.push({ from: start, to: i, color: 'rgba(217,83,79,0.06)' })
        start = null
      }
    })
    if (start !== null) out.push({ from: start, to: D.length - 1, color: 'rgba(217,83,79,0.06)' })
    return out
  }, [D])

  const budget = issuanceBudget(params)
  const burnedShare = last.burned / params.hardCap
  const dayLabel = (i: number) => `d${i}`

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="side-block">
          <div className="brandmark">
            <span className="glyph">§</span>
            <strong style={{ letterSpacing: '0.1em', fontSize: 13 }}>RESERVE DESK</strong>
          </div>
          <div className="side-title">Scenario</div>
          <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <div className="ctl-help" style={{ marginTop: 8 }}>{scenario.description}</div>

          <div className="ctl" style={{ marginTop: 16 }}>
            <div className="ctl-head">
              <span className="ctl-label">Horizon</span>
              <span className="ctl-value">{horizon}d</span>
            </div>
            <div className="btn-row">
              {HORIZONS.map((h) => (
                <button
                  key={h}
                  className={h === horizon ? 'primary' : 'ghost'}
                  onClick={() => setHorizon(h)}
                >
                  {h >= 365 ? `${(h / 365).toFixed(h % 365 ? 1 : 0)}y` : `${h}d`}
                </button>
              ))}
            </div>
          </div>

          <div className="btn-row">
            <button onClick={() => setSeed((s) => s + 1)}>Reroll flows (seed {seed})</button>
            <button onClick={() => setParams(DEFAULT_PARAMS)}>Reset params</button>
          </div>
        </div>

        <ParamControls params={params} onChange={patch} onFocusSection={focusSection} />

        <div className="side-block" style={{ borderBottom: 0 }}>
          <div className="side-title">Legend</div>
          <div className="ctl-help">
            <span className="badge whitepaper">WP</span> stated in the whitepaper ·{' '}
            <span className="badge derived">DRV</span> follows from a stated rule ·{' '}
            <span className="badge assumed">ASSUMED</span> redacted, so it is yours to set.
          </div>
          <div className="ctl-help" style={{ marginTop: 10 }}>
            Move any control and the page jumps to the section it changes.
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="wrap">
          <header className="masthead">
            <h1>Reserve Desk</h1>
            <p className="sub">
              A monetary policy simulator and banker's console for{' '}
              <a href={LINKS.site} target="_blank" rel="noreferrer">
                The Standard Reserve
              </a>
              . The whitepaper specifies a complete central bank and then leaves every launch
              number blank. I rebuilt the bank from that spec so you can supply the numbers
              yourself and watch what the economy does with them.
            </p>
            <div className="mast-links">
              <a href={LINKS.whitepaper} target="_blank" rel="noreferrer">Whitepaper ↗</a>
              <a href={LINKS.mint} target="_blank" rel="noreferrer">Genesis mint ↗</a>
              <a href={LINKS.x} target="_blank" rel="noreferrer">@standard_rsv ↗</a>
              <a href={LINKS.repo} target="_blank" rel="noreferrer">Source ↗</a>
            </div>
            <nav className="toc">
              <a href="#genesis">Genesis</a>
              <a href="#verdict">Verdict</a>
              <a href="#policy">Policy</a>
              <a href="#supply">Supply</a>
              <a href="#defense">Defense</a>
              <a href="#cohorts">Cohorts</a>
              <a href="#desk">The desk</a>
              <a href="#known">What is actually known</a>
            </nav>
          </header>

          <div className="disclaimer">
            <strong>Unofficial.</strong> I am not affiliated with The Standard Reserve and this is
            not endorsed by them. The protocol is pre launch: no token, no NFT, no deployed
            contracts. Every number marked <span className="badge assumed">ASSUMED</span> is a
            placeholder I chose, not a disclosed parameter. Nothing here is investment advice.
          </div>

          {/* Genesis */}
          <section id="genesis" className={cls('genesis')}>
            <div className="sec-head">
              <h2>Genesis mint</h2>
              <span className="ref">§6 · 1,000 Founding Charters, free, one per wallet</span>
            </div>
            <div className="card">
              <div className="grid g4" style={{ marginBottom: 16 }}>
                <Stat
                  label="Allocated"
                  value={int(GENESIS_ALLOCATED)}
                  foot={`of ${int(GENESIS_TOTAL)} · checked ${GENESIS_CHECKED}`}
                  tone="ok"
                />
                <Stat label="Remaining" value={int(GENESIS_TOTAL - GENESIS_ALLOCATED)} foot="allowlist plus open mint" />
                <Stat label="Progress" value={pct(GENESIS_ALLOCATED / GENESIS_TOTAL, 1)} foot="of the genesis cohort" />
                <Stat
                  label="Your share if you hold one"
                  value={pct(1 / GENESIS_TOTAL, 2)}
                  foot="of all charters, before auctions dilute the seat count"
                />
              </div>
              <div className="genesis-bar">
                <div
                  className="fill"
                  style={{ width: `${(GENESIS_ALLOCATED / GENESIS_TOTAL) * 100}%` }}
                />
              </div>
              <div className="charter-grid">
                {Array.from({ length: 200 }, (_, i) => (
                  <i key={i} className={i < Math.round((GENESIS_ALLOCATED / GENESIS_TOTAL) * 200) ? 'taken' : ''} />
                ))}
              </div>
              <p className="foot-note" style={{ marginTop: 12 }}>
                Each square is five charters. A charter is the only way into this economy that
                costs nothing. After genesis, seats are sold at a daily ETH Dutch auction that
                opens at 3× the previous day's close. A charter lives until its last branch is
                retired, at which point the NFT burns. There are no revolving doors.
              </p>
            </div>
          </section>

          {/* Verdict */}
          <section id="verdict" className={cls('verdict')}>
            <div className="sec-head">
              <h2>Verdict at {horizon} days</h2>
              <span className="ref">{scenario.label} · seed {seed}</span>
            </div>
            <div className="grid g4">
              <Stat
                label="Policy multiplier"
                value={last.m.toFixed(2) + '×'}
                foot={`band ${params.mMin} to ${params.mMax} · ${last.regime}`}
                tone={last.m <= params.mMin + 1e-6 ? 'bad' : last.m >= params.mMax - 1e-6 ? 'ok' : undefined}
              />
              <Stat
                label="Circulating supply"
                value={compact(last.circulating, 1)}
                foot={`${pct(last.circulating / params.hardCap, 1)} of the hard cap`}
              />
              <Stat
                label="Burned forever"
                value={compact(last.burned, 1)}
                foot={`${pct(burnedShare, 1)} of the cap · max supply now ${compact(last.maxSupply, 0)}`}
                tone="acc"
              />
              <Stat
                label="Issuance budget spent"
                value={pct(last.issuedCumulative / budget, 1)}
                foot={last.budgetExhausted ? 'exhausted, closed loop from here' : `${compact(budget - last.issuedCumulative, 0)} left`}
                tone={last.budgetExhausted ? 'warn' : undefined}
              />
              <Stat label="Spot price" value={fmtPrice(last.price)} foot="ETH per $STANDARD" />
              <Stat
                label="Hard reserves"
                value={eth(last.expansionVaultEth, 0)}
                foot="expansion vault, tokenized gold and comparable"
                tone="ok"
              />
              <Stat
                label="Branches"
                value={int(last.branches)}
                foot={`${int(last.charters)} charters · ${(last.branches / Math.max(1, last.charters)).toFixed(1)} each`}
              />
              <Stat
                label="Invariants"
                value={result.violations.length === 0 ? 'all hold' : `${result.violations.length} broken`}
                foot={
                  result.violations.length === 0
                    ? 'supply identity, budget, caps, bands'
                    : result.violations[0]
                }
                tone={result.violations.length === 0 ? 'ok' : 'bad'}
              />
            </div>
          </section>

          {/* Policy */}
          <section id="policy" className={cls('policy')}>
            <div className="sec-head">
              <h2>Capital flow becomes monetary policy</h2>
              <span className="ref">§4 and §5 · Fₙ = buys − sells · signalₙ = Fₙ₋₁ + Fₙ₋₂</span>
            </div>
            <p className="sec-note">
              Shaded stretches are contraction epochs, where fee routing flips to buybacks. The
              multiplier is the slow lever and the fee split is the fast one. Cuts land in a
              single epoch, raises are earned a step at a time.
            </p>
            <div className="grid g2">
              <Chart
                title="Net ETH flow and the policy signal"
                subtitle="ETH per day"
                fmt={(n) => compact(n, 0)}
                xLabels={dayLabel}
                zeroBase
                bands={contractionBands}
                series={[
                  { label: 'Net flow Fₙ', color: 'var(--blue)', values: D.map((d) => d.netFlowEth), area: true },
                  { label: 'Signal', color: 'var(--violet)', values: D.map((d) => d.signalEth) },
                ]}
              />
              <Chart
                title="The multiplier, m"
                subtitle={`cut ${params.rateCut}/epoch, raise ${params.rateRaise}/epoch`}
                fmt={(n) => n.toFixed(2)}
                xLabels={dayLabel}
                bands={contractionBands}
                series={[
                  { label: 'm', color: 'var(--gold)', values: D.map((d) => d.m), area: true },
                  { label: 'ceiling', color: 'var(--ink-3)', values: D.map(() => params.mMax), dashed: true },
                  { label: 'floor', color: 'var(--ink-3)', values: D.map(() => params.mMin), dashed: true },
                ]}
              />
              <Chart
                title="Daily yield per branch"
                subtitle="$STANDARD · the number every expansion decision divides by"
                fmt={(n) => compact(n, 0)}
                xLabels={dayLabel}
                series={[
                  { label: 'Yield / branch', color: 'var(--green)', values: D.map((d) => d.yieldPerBranch), area: true },
                ]}
              />
              <Chart
                title="Branches and the license auction"
                subtitle="N, and the day's clearing price"
                fmt={(n) => compact(n, 0)}
                fmtRight={(n) => compact(n, 0)}
                xLabels={dayLabel}
                series={[
                  { label: 'Branches N', color: 'var(--blue)', values: D.map((d) => d.branches), area: true },
                  { label: 'License clearing price', color: 'var(--gold)', values: D.map((d) => d.licenseClearingPrice || NaN), right: true },
                ]}
              />
            </div>
          </section>

          {/* Supply */}
          <section id="supply" className={cls('supply')}>
            <div className="sec-head">
              <h2>Circulating supply is a receipt</h2>
              <span className="ref">§3 · S_circ = 100M + M(t) − B(t) · S_max = 1B − B(t)</span>
            </div>
            <p className="sec-note">
              Every path through the economy either burns $STANDARD or brings the bank hard
              assets. Because burned tokens are gone forever, the maximum supply that can ever
              exist only falls. The dashed line is a ratchet.
            </p>
            <div className="grid g2">
              <Chart
                title="Supply"
                subtitle="tokens"
                fmt={(n) => compact(n, 0)}
                xLabels={dayLabel}
                series={[
                  { label: 'Max supply S_max', color: 'var(--ink-3)', values: D.map((d) => d.maxSupply), dashed: true },
                  { label: 'Circulating S_circ', color: 'var(--gold)', values: D.map((d) => d.circulating), area: true },
                  { label: 'Cumulative issuance', color: 'var(--violet)', values: D.map((d) => d.issuedCumulative) },
                ]}
              />
              <Chart
                title="Cumulative burns"
                subtitle="licenses, buybacks, and half of every resolution fee"
                fmt={(n) => compact(n, 0)}
                xLabels={dayLabel}
                series={[
                  { label: 'Burned B(t)', color: 'var(--red)', values: D.map((d) => d.burned), area: true },
                ]}
              />
              <Chart
                title="At the bank against in wallets"
                subtitle="unwithdrawn ledger balance D, against tokens minted"
                fmt={(n) => compact(n, 0)}
                xLabels={dayLabel}
                series={[
                  { label: 'Held at the bank D', color: 'var(--blue)', values: D.map((d) => d.bankBalance), area: true },
                  { label: 'Minted to wallets M(t)', color: 'var(--green)', values: D.map((d) => d.minted) },
                ]}
              />
              <Chart
                title="Spot price"
                subtitle="ETH per $STANDARD, constant product model"
                fmt={(n) => (n >= 0.001 ? n.toFixed(4) : n.toExponential(1))}
                xLabels={dayLabel}
                series={[
                  { label: 'Price', color: 'var(--gold)', values: D.map((d) => d.price), area: true },
                ]}
              />
            </div>
          </section>

          {/* Defense */}
          <section id="defense" className={cls('defense')}>
            <div className="sec-head">
              <h2>Reserves and defense</h2>
              <span className="ref">§11 · 70 / 15 / 15 · spend = min(0.10·V, 0.002·R) per tick</span>
            </div>
            <p className="sec-note">
              Fee revenue is direction agnostic. Buys and sells both pay in ETH. In expansion the
              vault stacks hard reserves; in contraction it finances buybacks and burns. The
              protocol converts volatility itself into balance sheet, whichever way price moves.
            </p>
            <div className="grid g2">
              <Chart
                title="The two vaults"
                subtitle="ETH"
                fmt={(n) => compact(n, 0)}
                xLabels={dayLabel}
                series={[
                  { label: 'Expansion vault (reserves)', color: 'var(--green)', values: D.map((d) => d.expansionVaultEth), area: true },
                  { label: 'Contraction vault (unspent)', color: 'var(--red)', values: D.map((d) => d.contractionVaultEth) },
                  { label: 'Team', color: 'var(--ink-3)', values: D.map((d) => d.teamEth), dashed: true },
                ]}
              />
              <Chart
                title="Buyback and burn"
                subtitle="ETH deployed, and tokens destroyed"
                fmt={(n) => compact(n, 1)}
                fmtRight={(n) => compact(n, 0)}
                xLabels={dayLabel}
                series={[
                  { label: 'ETH spent', color: 'var(--red)', values: D.map((d) => d.buybackEth), area: true },
                  { label: 'Tokens burned', color: 'var(--gold)', values: D.map((d) => d.buybackBurned), right: true },
                ]}
              />
              <Chart
                title="Exit pressure and the resolution fee"
                subtitle="§9 · trailing seven days"
                fmt={(n) => pct(n, 0)}
                xLabels={dayLabel}
                series={[
                  { label: 'Resolution fee', color: 'var(--red)', values: D.map((d) => d.resolutionFee), area: true },
                  { label: 'Exit pressure P', color: 'var(--blue)', values: D.map((d) => d.exitPressure) },
                ]}
              />
              <Chart
                title="Pool depth"
                subtitle="ETH reserve. Protocol owned liquidity only ever grows"
                fmt={(n) => compact(n, 0)}
                xLabels={dayLabel}
                series={[
                  { label: 'Pool ETH', color: 'var(--blue)', values: D.map((d) => d.poolEth), area: true },
                ]}
              />
            </div>
          </section>

          {/* Cohorts */}
          <section id="cohorts" className={cls('cohorts')}>
            <div className="sec-head">
              <h2>Who won</h2>
              <span className="ref">1,000 genesis charters across five temperaments</span>
            </div>
            <p className="sec-note">
              Net tokens is realised withdrawals plus the balance still at the bank, less
              everything spent on licenses. It is the honest answer to whether expanding beat
              holding under this scenario and these parameters, and it flips depending on both.
            </p>
            <div className="card table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Cohort</th>
                    <th>Behaviour</th>
                    <th className="num">Charters</th>
                    <th className="num">Branches</th>
                    <th className="num">At the bank</th>
                    <th className="num">In wallets</th>
                    <th className="num">Spent on licenses</th>
                    <th className="num">Fees received</th>
                    <th className="num">Net tokens</th>
                    <th className="num">Per charter</th>
                  </tr>
                </thead>
                <tbody>
                  {result.cohorts
                    .filter((c) => c.netTokens !== 0 || c.chartersAlive > 0)
                    .map((c) => {
                      const start = makeCohorts(params.foundingCharters).find((x) => x.id === c.id)
                      const startCharters = start?.charters ?? 0
                      return (
                        <tr key={c.id}>
                          <td>{c.label}</td>
                          <td style={{ color: 'var(--ink-3)' }}>{describe(c.strategy)}</td>
                          <td className="num">
                            {int(c.chartersAlive)}
                            {c.chartersAlive < startCharters && (
                              <span className="bad"> /{int(startCharters)}</span>
                            )}
                          </td>
                          <td className="num">{int(c.branches)}</td>
                          <td className="num">{compact(c.accrued, 1)}</td>
                          <td className="num">{compact(c.realized, 1)}</td>
                          <td className="num bad">{compact(c.spentOnLicenses, 1)}</td>
                          <td className="num pos">{compact(c.redistributionsReceived, 1)}</td>
                          <td className="num acc">{compact(c.netTokens, 1)}</td>
                          <td className="num">
                            {startCharters > 0 ? compact(c.netTokens / startCharters, 1) : '-'}
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Desk */}
          <section id="desk" className={cls('desk')}>
            <div className="sec-head">
              <h2>The desk</h2>
              <span className="ref">three decisions, seeded from day {last.day}</span>
            </div>
            <div className="grid">
              <Desk params={params} last={last} />
            </div>
          </section>

          {/* Known */}
          <section id="known" className={cls('known')}>
            <div className="sec-head">
              <h2>What is actually known</h2>
              <span className="ref">whitepaper v0.1, launch parameter table</span>
            </div>
            <p className="sec-note">
              The whitepaper publishes a launch parameter table with every value blank, closing
              with "final parameters will be announced closer to launch". This is the honest
              ledger of what that leaves you able to compute, and what you are guessing at.
            </p>
            <div className="card table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Source</th>
                    <th className="num">Value in this run</th>
                    <th>What the whitepaper says</th>
                  </tr>
                </thead>
                <tbody>
                  {PARAM_META.map((meta) => {
                    const prov = PROVENANCE[meta.key]
                    return (
                      <tr key={meta.key}>
                        <td>{meta.label}</td>
                        <td>
                          <span className={`badge ${prov}`}>
                            {prov === 'whitepaper' ? 'STATED' : prov === 'derived' ? 'DERIVED' : 'REDACTED'}
                          </span>
                        </td>
                        <td className="num">{String(params[meta.key])}</td>
                        <td style={{ color: 'var(--ink-2)' }}>{meta.help}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="grid g3" style={{ marginTop: 14 }}>
              <Stat
                label="Stated outright"
                value={int(Object.values(PROVENANCE).filter((p) => p === 'whitepaper').length)}
                foot="of the parameters this engine needs"
                tone="ok"
              />
              <Stat
                label="Redacted"
                value={int(Object.values(PROVENANCE).filter((p) => p === 'assumed').length)}
                foot="you are supplying these"
                tone="warn"
              />
              <Stat
                label="Flow sensitivity"
                value={signed(last.netFlowEth, (n) => eth(n, 0))}
                foot="the bank's only input on the last day"
              />
            </div>
          </section>

          <footer>
            <p className="foot-note">
              Reserve Desk is an independent, open source model of a protocol that has not
              launched. I implemented whitepaper v0.1 as faithfully as a public document allows,
              stated my assumptions in the open, and asserted the accounting identities on every
              simulated day. Where this model and the deployed contracts disagree, the contracts
              are right.{' '}
              <a href={LINKS.repo} target="_blank" rel="noreferrer">
                Read the source
              </a>{' '}
              ·{' '}
              <a href={LINKS.whitepaper} target="_blank" rel="noreferrer">
                Read the whitepaper
              </a>
            </p>
          </footer>
        </div>
      </main>
    </div>
  )
}

function describe(s: string): string {
  switch (s) {
    case 'compound':
      return 'expands whenever payback clears 20 days'
    case 'hold':
      return 'never expands, never exits'
    case 'harvest':
      return 'expands, then takes profit at 30 days of yield'
    case 'panic':
      return 'retires everything when policy hits the floor'
    default:
      return s
  }
}
