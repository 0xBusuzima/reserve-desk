import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_PARAMS,
  PARAM_META,
  PROVENANCE,
  SCENARIOS,
  charterSpread,
  compareRegimes,
  getScenario,
  issuanceBudget,
  makeCohorts,
  simulate,
} from './engine'
import type { Params } from './engine'
import { LINKS } from './config'
import { since, useGenesis, usePublishedSweep } from './useGenesis'
import { Chart } from './ui/Chart'
import { ParamControls } from './ui/Controls'
import { Desk, Stat } from './ui/Desk'
import { Game } from './ui/Game'
import { compact, eth, int, pct, price as fmtPrice, signed } from './ui/format'

const HORIZONS = [90, 180, 365, 730, 1095]

/**
 * True when the layout has collapsed to a single column.
 *
 * At that width the sidebar sits above the content, so leaving nineteen
 * sliders expanded would put three and a half screens of controls between a
 * new reader and the first chart. On a phone the lab starts closed.
 */
function useIsNarrow(): boolean {
  const query = '(max-width: 980px)'
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const sync = () => setNarrow(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return narrow
}

export default function App() {
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS)
  const [scenarioId, setScenarioId] = useState('chop')
  const [horizon, setHorizon] = useState(365)
  const [seed, setSeed] = useState(7)
  const [flash, setFlash] = useState<string | null>(null)

  const genesis = useGenesis()
  const narrow = useIsNarrow()
  const [labOpen, setLabOpen] = useState(false)
  const showParams = !narrow || labOpen
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
  const focusSection = useCallback(
    (id: string) => {
      // In one column the control and the chart can never share the screen, so
      // jumping away mid drag would take the slider out from under the thumb.
      if (narrow) return
      const el = document.getElementById(id)
      if (!el) return
      const box = el.getBoundingClientRect()
      const alreadyThere = box.top > -40 && box.top < window.innerHeight * 0.45
      if (lastSection.current === id && alreadyThere) return
      lastSection.current = id

      // Smooth is nice over a screen or two and painfully slow over ten, so
      // long jumps land instantly and the flash is what tells you where you are.
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const farAway = Math.abs(box.top) > window.innerHeight * 2.5
      el.scrollIntoView({ behavior: reduced || farAway ? 'auto' : 'smooth', block: 'start' })

      setFlash(id)
      window.clearTimeout(flashTimer.current)
      flashTimer.current = window.setTimeout(() => setFlash(null), 1100)
    },
    [narrow],
  )

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

  // The sign-versus-size comparison, computed here rather than quoted, so the
  // claim moves when you move the parameters that produce it.
  const regimes = useMemo(() => compareRegimes(params, ['chop', 'slow-bleed'], 365, 10), [params])
  const [chopRun, bleedRun] = regimes

  // Swept rather than assumed: the ratio survives the parameters being unknown,
  // which is the only reason it can be stated before launch.
  const liveSpread = useMemo(() => charterSpread(params), [params])
  // Prefer the published 2,430 run sweep so the page and the cards agree; the
  // live one takes over the moment you move a parameter away from the default.
  const published = usePublishedSweep()
  const touched = JSON.stringify(params) !== JSON.stringify(DEFAULT_PARAMS)
  const spread = !touched && published ? published : liveSpread
  const spreadSource =
    !touched && published
      ? `${int(published.runs)} runs across ${published.parameterSets} parameter sets`
      : `${liveSpread.runs} runs at your current parameters`

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

        {narrow && (
          <div className="side-block">
            <button className="lab-toggle" onClick={() => setLabOpen((v) => !v)}>
              {labOpen
                ? 'Close the parameter lab'
                : `Open the parameter lab (${PARAM_META.length} controls)`}
            </button>
            {!labOpen && (
              <div className="ctl-help" style={{ marginTop: 10 }}>
                Every number the whitepaper holds back is a control in here. Read on first if
                you would rather see what the defaults do.
              </div>
            )}
          </div>
        )}

        {showParams && (
          <>
            <ParamControls params={params} onChange={patch} onFocusSection={focusSection} />

            <div className="side-block" style={{ borderBottom: 0 }}>
              <div className="side-title">Legend</div>
              <div className="ctl-help">
                <span className="badge whitepaper">WP</span> stated in the whitepaper ·{' '}
                <span className="badge derived">DRV</span> follows from a stated rule ·{' '}
                <span className="badge assumed">ASSUMED</span> not published yet, so it is yours
                to set.
              </div>
              {!narrow && (
                <div className="ctl-help" style={{ marginTop: 10 }}>
                  Move any control and the page jumps to the section it changes.
                </div>
              )}
            </div>
          </>
        )}
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
              . The whitepaper specifies the mechanism in full and holds the launch numbers
              back. I rebuilt the bank from that spec so the numbers become the part you set,
              and you can watch what the economy does with whatever you pick.
            </p>
            <div className="mast-links">
              <a href={LINKS.whitepaper} target="_blank" rel="noreferrer">Whitepaper ↗</a>
              <a href={LINKS.mint} target="_blank" rel="noreferrer">Genesis mint ↗</a>
              <a href={LINKS.x} target="_blank" rel="noreferrer">@standard_rsv ↗</a>
              <a href={LINKS.repo} target="_blank" rel="noreferrer">Source ↗</a>
            </div>
            <nav className="toc">
              <a href="#play">Play</a>
              <a href="#genesis">Genesis</a>
              <a href="#verdict">Verdict</a>
              <a href="#findings">Findings</a>
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

          {/* Play */}
          <section id="play" className={cls('play')}>
            <div className="sec-head">
              <h2>Run a bank for a year</h2>
              <span className="ref">twelve epochs, three moves, no reading required</span>
            </div>
            <p className="sec-note">
              Everything below this measures the economy from outside. This is the part that
              puts you inside it. You hold one Founding Charter with one branch. Expand it,
              sit on it, or cash out, and find out which the mechanism rewards.
            </p>
            <Game />
          </section>

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
                  value={int(genesis.allocated)}
                  foot={`of ${int(genesis.total)} · read ${since(genesis.checkedAt)}`}
                  tone="ok"
                />
                <Stat
                  label="Remaining"
                  value={int(genesis.total - genesis.allocated)}
                  foot="allowlist plus open mint"
                />
                <Stat
                  label="Progress"
                  value={pct(genesis.allocated / genesis.total, 1)}
                  foot="of the genesis cohort"
                />
                <Stat
                  label="Your share if you hold one"
                  value={pct(1 / genesis.total, 2)}
                  foot="of all charters, before auctions dilute the seat count"
                />
              </div>
              <div className="genesis-bar">
                <div
                  className="fill"
                  style={{ width: `${(genesis.allocated / genesis.total) * 100}%` }}
                />
              </div>
              <div className="charter-grid">
                {Array.from({ length: 200 }, (_, i) => (
                  <i
                    key={i}
                    className={
                      i < Math.round((genesis.allocated / genesis.total) * 200) ? 'taken' : ''
                    }
                  />
                ))}
              </div>
              <p className="foot-note" style={{ marginTop: 12 }}>
                Each square is five charters. A charter is the only way into this economy that
                costs nothing. After genesis, seats are sold at a daily ETH Dutch auction that
                opens at 3× the previous day's close. A charter lives until its last branch is
                retired, at which point the NFT burns. There are no revolving doors.
              </p>
              <p className="foot-note" style={{ marginTop: 8 }}>
                <span className={`badge ${genesis.origin === 'live' ? 'whitepaper' : 'assumed'}`}>
                  {genesis.origin === 'live' ? 'LIVE' : 'BUILT IN'}
                </span>{' '}
                The count is read off the{' '}
                <a href={LINKS.mint} target="_blank" rel="noreferrer">
                  official mint page
                </a>{' '}
                on a schedule and published as a snapshot with this site. The protocol is pre
                launch, so there is no contract to query and no API to call. Every reading is
                committed to the repository, which makes the history of this number auditable.
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

          {/* Findings */}
          <section id="findings" className={cls('findings')}>
            <div className="sec-head">
              <h2>What running it turned up</h2>
              <span className="ref">five things I did not expect from reading alone</span>
            </div>
            <p className="sec-note">
              These are the reason the tool exists rather than a thread. Each one is either
              checkable against the whitepaper in a minute, or reproducible by running the model
              yourself. If any of them is wrong I would rather know.
            </p>

            <div className="card finding">
              <div className="finding-head">
                <span className="badge assumed">01</span>
                <h3>The policy signal reads sign, not size</h3>
              </div>
              <p>
                Section 4 sets the signal to Fₙ₋₁ + Fₙ₋₂ and section 5 steps the multiplier on it.
                Nothing published says the step scales with how much capital actually moved, and
                the multiplier is drawn as fixed per epoch steps. Under that reading, a market can
                take in far more ETH and be paid less for it, because what the bank rewards is
                consistency of direction rather than weight of capital.
              </p>
              <div className="grid g4" style={{ marginTop: 14 }}>
                <Stat
                  label="Chop, net capital in"
                  value={eth(chopRun.realisedEth, 0)}
                  foot="oscillates around zero, sign flips constantly"
                />
                <Stat
                  label="Slow bleed, net capital in"
                  value={eth(bleedRun.realisedEth, 0)}
                  foot="drifts one way, sign stays put"
                />
                <Stat
                  label="Chop issued"
                  value={compact(chopRun.issued, 1)}
                  foot={`avg multiplier ${chopRun.meanM.toFixed(2)}×`}
                  tone="bad"
                />
                <Stat
                  label="Slow bleed issued"
                  value={compact(bleedRun.issued, 1)}
                  foot={`avg multiplier ${bleedRun.meanM.toFixed(2)}×`}
                  tone="ok"
                />
              </div>
              <p className="foot-note" style={{ marginTop: 12 }}>
                Ten seeds, 365 days each, at whatever parameters you currently have set. The gap
                narrows if the cut and the raise are made equal, so the asymmetry amplifies it,
                but it does not close, because a sign rule cannot see magnitude either way. If
                equation 5.2 does scale by signal size, this finding disappears, and that is
                precisely why the equation matters.
              </p>
            </div>

            <div className="card finding">
              <div className="finding-head">
                <span className="badge assumed">02</span>
                <h3>A charter is not the asset. The branches are.</h3>
              </div>
              <p>
                Everyone chasing a Founding Charter is chasing the licence, but issuance is split
                across branches, not charters. One charter can hold ten. So the question that
                actually decides your year is not whether you get a seat, it is whether you
                expand it, and the answer barely depends on the numbers nobody has published
                yet. A share is a ratio, and the ten branch cap bounds it whatever the base rate
                turns out to be.
              </p>
              <div className="grid g4" style={{ marginTop: 14 }}>
                <Stat
                  label="Expanding vs holding"
                  value={`${spread.median.toFixed(1)}x`}
                  foot="median tokens per charter after a year"
                  tone="ok"
                />
                <Stat
                  label="Worst case seen"
                  value={`${spread.worst.toFixed(1)}x`}
                  foot={spreadSource}
                />
                <Stat
                  label="Runs where expanding lost"
                  value={`${(100 - spread.everBeatenPct).toFixed(0)}%`}
                  foot="it did not lose in any of them"
                  tone="acc"
                />
                <Stat
                  label="Branches after a year"
                  value={int(spread.medianBranches)}
                  foot={`from ${int(params.foundingCharters)} at genesis, so a single branch is diluted`}
                  tone="warn"
                />
              </div>
              <p className="foot-note" style={{ marginTop: 12 }}>
                Swept over base issuance, the multiplier band, epoch length and the cut step.
                The figures above are the published sweep from
                {' '}<code>scripts/measure-findings.mjs</code>; move any control and the page
                recomputes a smaller version live so you can see the claim survive your own
                numbers. One caveat that matters: this assumes licenses are paid from the accrued balance.
                Under the other reading of section 2 an expander has to buy tokens on the market
                first, which costs more than this model charges them.
              </p>
            </div>

            <div className="card finding">
              <div className="finding-head">
                <span className="badge assumed">03</span>
                <h3>Section 10 adds up to 102%</h3>
              </div>
              <p>
                For one dormant balance the whitepaper lists an informant bounty of 2%, a
                revocation fee of 70%, and 30% returned to the wallet. That is 102% of a balance
                that only has 100% in it. The engine assumes the bounty comes out of the fee, so
                the burn and redistribute halves apply to 68%, but that is my guess. The other
                reading has the informant paid by the victim.
              </p>
            </div>

            <div className="card finding">
              <div className="finding-head">
                <span className="badge assumed">04</span>
                <h3>What expansion licenses are paid with is unresolved, and it decides a flywheel</h3>
              </div>
              <p>
                Section 2 says bankers spend <em>earned</em> $STANDARD on licenses and section 13
                calls it the largest supply sink. If that means the accrued balance at the bank,
                expansion is self financing and burns tokens that were never minted. If it means
                ERC-20 tokens in a wallet, an expander has to either retire the branch they are
                trying to add to, or buy on the open market, which turns the largest supply sink
                into a source of buy pressure as well. Those are very different economies.
              </p>
            </div>

            <div className="card finding">
              <div className="finding-head">
                <span className="badge assumed">05</span>
                <h3>On day one there is nothing to sell</h3>
              </div>
              <p>
                The supply identity in section 3 says circulating supply is 100M plus withdrawals
                minus burns, and the 100M is the genesis position locked in the pool forever. So
                at launch the entire float is the pool, and a token can only reach a wallet when a
                banker retires a branch and pays the resolution fee to do it. Sell pressure has to
                be manufactured, at cost, before it can exist. It follows that the early net flow
                signal is measured on a book that is structurally one sided, and that a run cannot
                start on day one no matter how badly the market wants one.
              </p>
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
              with "final parameters will be announced closer to launch". That is deliberate and
              it is their call. This is simply the honest ledger of what it leaves you able to
              compute, and what you are supplying yourself.
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
                            {prov === 'whitepaper' ? 'STATED' : prov === 'derived' ? 'DERIVED' : 'UNPUBLISHED'}
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
                label="Still unpublished"
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
