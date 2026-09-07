import { PARAM_META, PROVENANCE } from '../engine'
import type { Params } from '../engine'
import { compact, pct } from './format'

function display(value: number, unit: string): string {
  switch (unit) {
    case 'pct':
      return pct(value, value < 0.01 ? 2 : 1)
    case 'x':
      return value.toFixed(2) + '×'
    case 'day':
      return value + 'd'
    case 'eth':
      return value + ' ETH'
    case 'bps':
      return value + ' bps'
    case 'token':
      return compact(value, 0)
    default:
      return String(value)
  }
}

interface Props {
  params: Params
  onChange(patch: Partial<Params>): void
  /**
   * Called with the id of the section a control belongs to, so the reader can
   * be taken to the part of the page that is about to change.
   */
  onFocusSection?(section: string): void
}

export function ParamControls({ params, onChange, onFocusSection }: Props) {
  const groups = [...new Set(PARAM_META.map((m) => m.group))]

  return (
    <>
      {groups.map((group) => (
        <div className="side-block" key={group}>
          <div className="side-title">{group}</div>
          {PARAM_META.filter((m) => m.group === group).map((meta) => {
            const prov = PROVENANCE[meta.key]
            const value = params[meta.key]
            return (
              <div className="ctl" key={meta.key}>
                <div className="ctl-head">
                  <span className="ctl-label">
                    {meta.label}
                    <span className={`badge ${prov}`} title={provTitle(prov)}>
                      {prov === 'whitepaper' ? 'WP' : prov === 'derived' ? 'DRV' : 'ASSUMED'}
                    </span>
                  </span>
                  <span className="ctl-value">{display(value, meta.unit)}</span>
                </div>
                <input
                  type="range"
                  min={meta.min}
                  max={meta.max}
                  step={meta.step}
                  value={value}
                  onChange={(e) => {
                    onFocusSection?.(meta.section)
                    onChange({ [meta.key]: Number(e.target.value) } as Partial<Params>)
                  }}
                  onPointerDown={() => onFocusSection?.(meta.section)}
                  onFocus={() => onFocusSection?.(meta.section)}
                  aria-label={meta.label}
                />
                <div className="ctl-help">{meta.help}</div>
              </div>
            )
          })}
        </div>
      ))}
    </>
  )
}

function provTitle(p: string): string {
  if (p === 'whitepaper') return 'Stated verbatim in whitepaper v0.1.'
  if (p === 'derived') return 'The whitepaper states the rule; this number follows from it.'
  return 'Redacted in the whitepaper. This is an assumption you control.'
}
