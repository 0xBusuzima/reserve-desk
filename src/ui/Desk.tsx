import { useMemo, useState } from 'react'
import {
  defenseCapacity,
  exitCost,
  feeCurve,
  licensePayback,
  runScenario,
} from '../engine'
import type { DayState, Params } from '../engine'
import { Chart } from './Chart'
import { compact, days as fmtDays, eth, pct } from './format'

interface Props {
  params: Params
  /** The last simulated day, used to seed the calculators with live state. */
  last: DayState
}

/**
 * The three decisions a banker actually faces, each with the arithmetic done.
 * Seeded from wherever the simulation ended, then overridable. The point is
 * to answer "given the board I am looking at, what should I do today".
 */
export function Desk({ params, last }: Props) {
  return (
    <>
      <LicenseDesk params={params} last={last} />
      <ExitDesk params={params} last={last} />
      <DefenseDesk params={params} last={last} />
    </>
  )
}

// ---------------------------------------------------------------------------

function LicenseDesk({ params, last }: Props) {
  const [branches, setBranches] = useState(last.branches)
  const [m, setM] = useState(last.m)
  const [target, setTarget] = useState(14)

  const r = useMemo(
    () =>
      licensePayback({
        params,
        branches,
        m,
        lastClearingPrice: last.licenseClearingPrice,
      }),
    [params, branches, m, last.licenseClearingPrice],
  )

  const hour = r.hourForTarget(target)
  const floorPayback = r.floor / r.marginalYield

  return (
    <div className="card">
      <div className="chart-head" style={{ marginBottom: 12 }}>
        <span className="chart-title">Should I buy a license today?</span>
        <span className="chart-sub mono">§7 · P(t) = P₀(P_floor/P₀)^(t/24h)</span>
      </div>

      <div className="grid g3" style={{ marginBottom: 14 }}>
        <label>
          <div className="ctl-head">
            <span className="ctl-label">Branches in system, N</span>
          </div>
          <input
            type="number"
            value={branches}
            min={1}
            onChange={(e) => setBranches(Math.max(1, Number(e.target.value)))}
          />
        </label>
        <label>
          <div className="ctl-head">
            <span className="ctl-label">Multiplier, m</span>
          </div>
          <input
            type="number"
            step={0.05}
            value={m}
            onChange={(e) => setM(Math.max(0, Number(e.target.value)))}
          />
        </label>
        <label>
          <div className="ctl-head">
            <span className="ctl-label">Your payback target</span>
          </div>
          <input
            type="number"
            value={target}
            min={0.5}
            step={0.5}
            onChange={(e) => setTarget(Math.max(0.5, Number(e.target.value)))}
          />
        </label>
      </div>

      <Chart
        title="Today's license curve"
        subtitle="price, in $STANDARD"
        height={170}
        fmt={(n) => compact(n, 0)}
        xLabels={(i) => `${i}h`}
        series={[
          {
            label: 'Auction price',
            color: 'var(--gold)',
            values: r.curve.map((p) => p.price),
            area: true,
          },
          {
            label: `Your limit (${target}d payback)`,
            color: 'var(--blue)',
            values: r.curve.map(() => target * r.marginalYield),
            dashed: true,
          },
        ]}
      />

      <div className="grid g4" style={{ marginTop: 14 }}>
        <Stat label="Opens at" value={compact(r.open, 0)} foot="$STANDARD" />
        <Stat
          label="Floor"
          value={compact(r.floor, 0)}
          foot={`${floorPayback.toFixed(1)}d of yield`}
        />
        <Stat
          label="A new branch earns"
          value={compact(r.marginalYield, 0)}
          foot="$STANDARD / day, at N+1"
        />
        <Stat
          label="Your entry"
          value={hour === null ? 'never' : `${hour.toFixed(1)}h`}
          foot={
            hour === null
              ? 'the floor never reaches your target'
              : hour === 0
                ? 'cheap from the open, buy early'
                : 'wait this long into the day'
          }
          tone={hour === null ? 'bad' : hour < 6 ? 'ok' : 'warn'}
        />
      </div>

      <p className="foot-note" style={{ marginTop: 12 }}>
        The number that decides this is not the price, it is the price divided by what the branch
        earns. Every buyer faces the same trade off. Pay a premium for certainty at the open, or
        wait for a lower price and risk the day selling out. Where that tension resolves is the
        market price; the floor only exists to prevent literal zero sales.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------

function ExitDesk({ params, last }: Props) {
  const [yourBalance, setYourBalance] = useState(
    Math.max(1000, Math.round(last.bankBalance / Math.max(1, last.charters))),
  )
  const [yourBranches, setYourBranches] = useState(Math.min(params.maxBranchesPerCharter, 4))
  const [retiring, setRetiring] = useState(1)
  const [crowd, setCrowd] = useState(0.1)

  const withdrawn7d = last.bankBalance * crowd
  const result = useMemo(
    () =>
      exitCost({
        params,
        bankBalance: last.bankBalance,
        yourBalance,
        yourBranches,
        retiring: Math.min(retiring, yourBranches),
        withdrawn7d,
      }),
    [params, last.bankBalance, yourBalance, yourBranches, retiring, withdrawn7d],
  )

  const curve = useMemo(() => feeCurve(params), [params])

  const runRows = [0.02, 0.05, 0.1, 0.2, 0.35, 0.5].map((share) =>
    runScenario(params, last.bankBalance, share),
  )

  return (
    <div className="card">
      <div className="chart-head" style={{ marginBottom: 12 }}>
        <span className="chart-title">What does it cost me to leave?</span>
        <span className="chart-sub mono">§9 · P = W / max(D+W, ·)</span>
      </div>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <label>
          <div className="ctl-head">
            <span className="ctl-label">Your accrued balance</span>
          </div>
          <input
            type="number"
            value={yourBalance}
            onChange={(e) => setYourBalance(Math.max(0, Number(e.target.value)))}
          />
        </label>
        <label>
          <div className="ctl-head">
            <span className="ctl-label">Your branches</span>
          </div>
          <input
            type="number"
            min={1}
            max={params.maxBranchesPerCharter}
            value={yourBranches}
            onChange={(e) => {
              const v = Math.min(params.maxBranchesPerCharter, Math.max(1, Number(e.target.value)))
              setYourBranches(v)
              setRetiring((r) => Math.min(r, v))
            }}
          />
        </label>
        <label>
          <div className="ctl-head">
            <span className="ctl-label">Retiring</span>
          </div>
          <input
            type="number"
            min={1}
            max={yourBranches}
            value={retiring}
            onChange={(e) =>
              setRetiring(Math.min(yourBranches, Math.max(1, Number(e.target.value))))
            }
          />
        </label>
        <label>
          <div className="ctl-head">
            <span className="ctl-label">Crowd leaving this week</span>
            <span className="ctl-value">{pct(crowd)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={0.6}
            step={0.01}
            value={crowd}
            onChange={(e) => setCrowd(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat label="Resolution fee" value={pct(result.feeRate)} foot={`pressure ${pct(result.pressure)}`} tone={result.feeRate > 0.2 ? 'bad' : result.feeRate > 0.08 ? 'warn' : 'ok'} />
        <Stat label="Released" value={compact(result.released, 0)} foot={`${retiring}/${yourBranches} of your balance`} />
        <Stat label="Reaches your wallet" value={compact(result.net, 0)} foot="$STANDARD, net of fee" tone="ok" />
        <Stat
          label="Charter"
          value={result.dissolvesCharter ? 'burns' : 'survives'}
          foot={result.dissolvesCharter ? 'closing the last store dissolves the company' : `${yourBranches - retiring} branches left`}
          tone={result.dissolvesCharter ? 'bad' : undefined}
        />
      </div>

      <Chart
        title="Resolution fee vs. seven-day exit pressure"
        subtitle="quadratic, floor to ceiling"
        height={160}
        fmt={(n) => pct(n, 0)}
        xLabels={(i) => pct(curve[i]?.pressure ?? 0, 0)}
        series={[
          { label: 'Fee', color: 'var(--red)', values: curve.map((c) => c.fee), area: true },
          {
            label: 'You, right now',
            color: 'var(--gold)',
            values: curve.map((c) =>
              Math.abs(c.pressure - result.pressure) < 0.012 ? result.feeRate : NaN,
            ),
          },
        ]}
      />

      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table>
          <thead>
            <tr>
              <th>If this much of the bank runs</th>
              <th className="num">Fee they pay</th>
              <th className="num">Burned</th>
              <th className="num">Paid to stayers</th>
              <th className="num">Bonus per staying token</th>
            </tr>
          </thead>
          <tbody>
            {runRows.map((r) => (
              <tr key={r.share}>
                <td className="mono">{pct(r.share, 0)}</td>
                <td className="num">{pct(r.feeRate)}</td>
                <td className="num">{compact(r.burned, 1)}</td>
                <td className="num">{compact(r.toStayers, 1)}</td>
                <td className="num pos">+{pct(r.stayerYield, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="foot-note" style={{ marginTop: 12 }}>
        This inverts the payoff structure of a bank run. In a traditional run whoever exits first is
        made whole and whoever waits absorbs the loss, so running first is always correct. Here,
        heavy exit volume raises the fee on the exiters themselves and half of what they pay goes to
        the positions that stayed. Withdrawals are never paused or queued at any fee level. The
        cost of leaving is the only control mechanism.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------

function DefenseDesk({ params, last }: Props) {
  const [vault, setVault] = useState(Math.max(1, Math.round(last.contractionVaultEth + last.expansionVaultEth)))
  const d = useMemo(() => defenseCapacity(params, vault, last.poolEth), [params, vault, last.poolEth])
  const vaultBound = params.buybackVaultFraction * vault < params.buybackDepthFraction * last.poolEth

  return (
    <div className="card">
      <div className="chart-head" style={{ marginBottom: 12 }}>
        <span className="chart-title">How hard can the bank actually defend?</span>
        <span className="chart-sub mono">§11 · spend = min(0.10·V, 0.002·R) per tick</span>
      </div>

      <div className="grid g2" style={{ marginBottom: 14 }}>
        <label>
          <div className="ctl-head">
            <span className="ctl-label">Contraction vault</span>
            <span className="ctl-value">{eth(vault, 0)}</span>
          </div>
          <input
            type="number"
            value={vault}
            min={0}
            onChange={(e) => setVault(Math.max(0, Number(e.target.value)))}
          />
        </label>
        <div>
          <div className="ctl-head">
            <span className="ctl-label">Pool depth</span>
            <span className="ctl-value">{eth(last.poolEth, 0)}</span>
          </div>
          <div className="ctl-help">Taken from where the simulation ended.</div>
        </div>
      </div>

      <div className="grid g3">
        <Stat label="Deployable per day" value={eth(d.dailySpendEth, 1)} foot={`over ${params.buybackTicksPerDay} ticks`} />
        <Stat label="Share of depth" value={pct(d.shareOfDepth, 2)} foot="per day" tone={d.shareOfDepth > 0.02 ? 'ok' : 'warn'} />
        <Stat label="Drains in" value={fmtDays(d.daysToDrain)} foot="at this rate" />
      </div>

      <p className="foot-note" style={{ marginTop: 12 }}>
        {vaultBound ? (
          <>
            <span className="warn">Vault-bound.</span> The throttle is limited by how much ETH the
            bank holds, not by the market. Fee revenue is the binding constraint on defense.
          </>
        ) : (
          <>
            <span className="warn">Depth-bound.</span> The throttle is limited by pool depth. Adding
            more ETH to the vault buys no additional defense today; it only extends how many days
            the bank can keep buying.
          </>
        )}{' '}
        Unspent balance rolls forward, and the vault can never sell.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Stat({
  label,
  value,
  foot,
  tone,
}: {
  label: string
  value: string
  foot?: string
  tone?: 'ok' | 'warn' | 'bad' | 'acc'
}) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className={`value ${tone ?? ''}`}>{value}</div>
      {foot && <div className="foot">{foot}</div>}
    </div>
  )
}

export { Stat }

