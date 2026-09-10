import { useMemo, useState } from 'react'
import { EPOCHS, newGame, step, view } from '../engine'
import type { GameState, Move } from '../engine'
import { compact, eth, pct } from './format'

/**
 * Twelve Epochs, the playable version of the model.
 *
 * Everything else on this page measures the economy from outside. This is the
 * only part that puts you inside it, which is the difference between reading
 * that exits are congestion priced and watching the fee triple while you
 * decide whether to leave.
 */
export function Game() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000))
  const [state, setState] = useState<GameState>(() => newGame(seed))

  const v = useMemo(() => view(state), [state])
  const play = (move: Move) => setState((s) => step(s, move))
  const restart = () => {
    const next = Math.floor(Math.random() * 100000)
    setSeed(next)
    setState(newGame(next))
  }

  const canExpand = v.yourBranches < state.params.maxBranchesPerCharter && v.yourBalance >= v.licensePrice
  const wouldRelease = v.yourBranches > 0 ? v.yourBalance / v.yourBranches : 0
  const wouldKeep = wouldRelease * (1 - v.exitFee)

  if (state.done && state.result) {
    const r = state.result
    return (
      <div className="card game">
        <div className="game-head">
          <span className="game-tag">RUN COMPLETE</span>
          <span className="ref">12 epochs · seed {state.seed}</span>
        </div>

        <div className={`game-grade ${r.grade}`}>{gradeLabel(r.grade)}</div>
        <p className="game-verdict">{r.verdict}</p>

        <div className="grid g3" style={{ marginTop: 18 }}>
          <div className="game-stat">
            <div className="k">You finished with</div>
            <div className="v acc">{compact(r.finalTokens, 1)}</div>
            <div className="f">$STANDARD, wallet plus bank</div>
          </div>
          <div className="game-stat">
            <div className="k">If you had only held</div>
            <div className="v">{compact(r.ifHeld, 1)}</div>
            <div className="f">never expanded, never exited</div>
          </div>
          <div className="game-stat">
            <div className="k">If you had always expanded</div>
            <div className="v">{compact(r.ifExpanded, 1)}</div>
            <div className="f">a licence whenever affordable</div>
          </div>
        </div>

        <div className="game-log" style={{ marginTop: 16 }}>
          {state.log.length === 0 ? (
            <div className="game-log-line">You did nothing for a year. The clock still ran.</div>
          ) : (
            state.log.map((l, i) => (
              <div className="game-log-line" key={i}>
                {l}
              </div>
            ))
          )}
        </div>

        <div className="btn-row" style={{ marginTop: 18 }}>
          <button className="primary" onClick={restart}>
            Run another year
          </button>
        </div>

        <p className="foot-note" style={{ marginTop: 14 }}>
          The licence price, the multiplier step and the exit fee are the whitepaper's own
          formulas from sections 7, 5 and 9. The launch parameters behind them are still
          unpublished, so this is one plausible economy, not a forecast.
        </p>
      </div>
    )
  }

  return (
    <div className="card game">
      <div className="game-head">
        <span className="game-tag">
          EPOCH {v.epoch + 1} <span className="of">of {EPOCHS}</span>
        </span>
        <span className="ref">one epoch is a month · seed {state.seed}</span>
      </div>

      <div className="game-market">
        <div className={`flow ${v.regime}`}>
          <div className="k">Net ETH through the pool</div>
          <div className="v">
            {v.netFlowEth >= 0 ? '+' : ''}
            {eth(v.netFlowEth, 0)}
          </div>
          <div className="f">{v.regime === 'expansion' ? 'capital coming in' : 'capital leaving'}</div>
        </div>
        <div className="policy">
          <div className="k">Issuance multiplier</div>
          <div className="v">{v.m.toFixed(2)}×</div>
          <div className="f">
            {v.m <= state.params.mMin + 1e-6
              ? 'on the floor, cuts have nowhere left to go'
              : v.regime === 'expansion'
                ? 'a positive signal raises it one step'
                : 'a negative signal cuts it three times faster'}
          </div>
        </div>
      </div>

      <div className="game-bank">
        <div className="branches">
          <div className="k">Your branches</div>
          <div className="cells">
            {Array.from({ length: state.params.maxBranchesPerCharter }, (_, i) => (
              <i key={i} className={i < v.yourBranches ? 'on' : ''} />
            ))}
          </div>
          <div className="f">
            {v.yourBranches} of {state.params.maxBranchesPerCharter} · your share is{' '}
            {pct(v.yourBranches / v.systemBranches, 3)} of every epoch, and{' '}
            {compact(v.systemBranches, 0)} branches are competing for it
          </div>
        </div>
        <div className="purse">
          <div className="row">
            <span>At the bank</span>
            <strong>{compact(v.yourBalance, 1)}</strong>
          </div>
          <div className="row">
            <span>In your wallet</span>
            <strong className="pos">{compact(v.yourWallet, 1)}</strong>
          </div>
          <div className="row muted">
            <span>Earned this epoch</span>
            <strong>+{compact(v.earnedThisEpoch, 1)}</strong>
          </div>
        </div>
      </div>

      <div className="game-moves">
        <button className="move expand" disabled={!canExpand} onClick={() => play({ kind: 'expand' })}>
          <span className="t">Open a branch</span>
          <span className="d">
            {v.yourBranches >= state.params.maxBranchesPerCharter
              ? 'at the ten branch cap'
              : `${compact(v.licensePrice, 1)} burned · pays back in ${
                  Number.isFinite(v.licensePayback) ? Math.round(v.licensePayback) : '?'
                } days`}
          </span>
        </button>

        <button className="move hold" onClick={() => play({ kind: 'hold' })}>
          <span className="t">Hold</span>
          <span className="d">keep accruing, spend nothing</span>
        </button>

        <button
          className="move retire"
          disabled={v.yourBranches === 0 || v.yourBalance <= 0}
          onClick={() => play({ kind: 'retire', branches: 1 })}
        >
          <span className="t">Retire a branch</span>
          <span className="d">
            {compact(wouldKeep, 1)} to your wallet · {pct(v.exitFee, 0)} fee
            {v.yourBranches === 1 ? ' · burns your charter' : ''}
          </span>
        </button>
      </div>

      {state.log.length > 0 && (
        <div className="game-log">
          {state.log.slice(-3).map((l, i) => (
            <div className="game-log-line" key={i}>
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function gradeLabel(g: string): string {
  switch (g) {
    case 'ruined':
      return 'Charter dissolved'
    case 'behind':
      return 'Behind the naive lines'
    case 'even':
      return 'Roughly even'
    case 'ahead':
      return 'Ahead of both'
    default:
      return 'You read the cycle'
  }
}
