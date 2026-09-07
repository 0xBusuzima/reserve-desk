import { useId, useMemo, useState } from 'react'

export interface Series {
  label: string
  color: string
  values: number[]
  /** Fill under the line. */
  area?: boolean
  dashed?: boolean
  /** Plot against the right-hand scale instead of the left. */
  right?: boolean
}

interface Props {
  title: string
  subtitle?: string
  series: Series[]
  /** X labels, one per point. Only a handful are drawn. */
  xLabels?: (i: number) => string
  height?: number
  /** Format for the left axis and tooltip. */
  fmt?: (n: number) => string
  fmtRight?: (n: number) => string
  /** Force the left scale to include zero. */
  zeroBase?: boolean
  /** Shade regions of the x-axis, e.g. contraction epochs. */
  bands?: { from: number; to: number; color: string }[]
}

const PAD = { top: 10, right: 46, bottom: 20, left: 50 }

function extent(vals: number[][], zeroBase: boolean): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const arr of vals) {
    for (const v of arr) {
      if (!Number.isFinite(v)) continue
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1]
  if (zeroBase) {
    lo = Math.min(lo, 0)
    hi = Math.max(hi, 0)
  }
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.1 || 1
    return [lo - pad, hi + pad]
  }
  const pad = (hi - lo) * 0.08
  return [lo - pad, hi + pad]
}

/**
 * A small multi-series line chart. Hand-rolled SVG rather than a chart
 * library: the shapes here are simple, and a dependency-free bundle keeps the
 * whole app loadable from a static host with no build surprises.
 */
export function Chart({
  title,
  subtitle,
  series,
  xLabels,
  height = 190,
  fmt = (n) => n.toPrecision(3),
  fmtRight,
  zeroBase = false,
  bands = [],
}: Props) {
  const uid = useId().replace(/:/g, '')
  const [hover, setHover] = useState<number | null>(null)

  const W = 720
  const H = height
  const iw = W - PAD.left - PAD.right
  const ih = H - PAD.top - PAD.bottom

  const n = Math.max(...series.map((s) => s.values.length), 1)

  const leftSeries = series.filter((s) => !s.right)
  const rightSeries = series.filter((s) => s.right)

  const [lo, hi] = useMemo(
    () => extent(leftSeries.map((s) => s.values), zeroBase),
    [leftSeries, zeroBase],
  )
  const [rlo, rhi] = useMemo(
    () => extent(rightSeries.map((s) => s.values), false),
    [rightSeries],
  )

  const x = (i: number) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * iw)
  const yL = (v: number) => PAD.top + ih - ((v - lo) / (hi - lo || 1)) * ih
  const yR = (v: number) => PAD.top + ih - ((v - rlo) / (rhi - rlo || 1)) * ih

  const path = (s: Series) => {
    const y = s.right ? yR : yL
    let d = ''
    let open = false
    s.values.forEach((v, i) => {
      if (!Number.isFinite(v)) {
        open = false
        return
      }
      d += `${open ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`
      open = true
    })
    return d
  }

  const areaPath = (s: Series) => {
    const y = s.right ? yR : yL
    const base = s.right ? yR(Math.max(rlo, 0)) : yL(Math.max(lo, 0))
    let d = `M${x(0).toFixed(2)},${base.toFixed(2)}`
    s.values.forEach((v, i) => {
      if (!Number.isFinite(v)) return
      d += `L${x(i).toFixed(2)},${y(v).toFixed(2)}`
    })
    d += `L${x(s.values.length - 1).toFixed(2)},${base.toFixed(2)}Z`
    return d
  }

  const ticks = 4
  const leftTicks = Array.from({ length: ticks + 1 }, (_, i) => lo + ((hi - lo) * i) / ticks)
  const rightTicks = Array.from({ length: ticks + 1 }, (_, i) => rlo + ((rhi - rlo) * i) / ticks)

  const xTickIdx = n <= 1 ? [0] : [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1]

  return (
    <div className="chart-card">
      <div className="chart-head">
        <span className="chart-title">{title}</span>
        {subtitle && <span className="chart-sub">{subtitle}</span>}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const px = ((e.clientX - r.left) / r.width) * W
          const i = Math.round(((px - PAD.left) / iw) * (n - 1))
          setHover(i >= 0 && i < n ? i : null)
        }}
      >
        <defs>
          {series.map((s, si) =>
            s.area ? (
              <linearGradient key={si} id={`${uid}-g${si}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0" />
              </linearGradient>
            ) : null,
          )}
        </defs>

        {bands.map((b, i) => (
          <rect
            key={i}
            x={x(b.from)}
            y={PAD.top}
            width={Math.max(0.5, x(b.to) - x(b.from))}
            height={ih}
            fill={b.color}
          />
        ))}

        {leftTicks.map((t, i) => (
          <g key={i}>
            <line className="grid-line" x1={PAD.left} x2={W - PAD.right} y1={yL(t)} y2={yL(t)} />
            <text className="axis-text" x={PAD.left - 6} y={yL(t) + 3} textAnchor="end">
              {fmt(t)}
            </text>
          </g>
        ))}

        {rightSeries.length > 0 &&
          rightTicks.map((t, i) => (
            <text
              key={i}
              className="axis-text"
              x={W - PAD.right + 6}
              y={yR(t) + 3}
              textAnchor="start"
            >
              {(fmtRight ?? fmt)(t)}
            </text>
          ))}

        {lo < 0 && hi > 0 && (
          <line className="zero-line" x1={PAD.left} x2={W - PAD.right} y1={yL(0)} y2={yL(0)} />
        )}

        {series.map((s, si) =>
          s.area ? <path key={`a${si}`} d={areaPath(s)} fill={`url(#${uid}-g${si})`} /> : null,
        )}

        {series.map((s, si) => (
          <path
            key={`l${si}`}
            d={path(s)}
            fill="none"
            stroke={s.color}
            strokeWidth={1.6}
            strokeDasharray={s.dashed ? '3 3' : undefined}
            strokeLinejoin="round"
          />
        ))}

        {hover !== null && (
          <g>
            <line
              className="zero-line"
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + ih}
              stroke="var(--ink-3)"
            />
            {series.map((s, si) => {
              const v = s.values[hover]
              if (!Number.isFinite(v)) return null
              return (
                <circle
                  key={si}
                  cx={x(hover)}
                  cy={(s.right ? yR : yL)(v)}
                  r={2.6}
                  fill={s.color}
                />
              )
            })}
          </g>
        )}

        {xTickIdx.map((i) => (
          <text key={i} className="axis-text" x={x(i)} y={H - 6} textAnchor="middle">
            {xLabels ? xLabels(i) : `d${i}`}
          </text>
        ))}
      </svg>

      <div className="legend">
        {series.map((s, i) => (
          <span key={i}>
            <span className="swatch" style={{ background: s.color }} />
            {s.label}
            {hover !== null && Number.isFinite(s.values[hover]) && (
              <span className="mono" style={{ color: s.color, marginLeft: 6 }}>
                {(s.right ? (fmtRight ?? fmt) : fmt)(s.values[hover])}
              </span>
            )}
          </span>
        ))}
        {hover !== null && (
          <span className="mono" style={{ color: 'var(--ink-3)', marginLeft: 'auto' }}>
            {xLabels ? xLabels(hover) : `day ${hover}`}
          </span>
        )}
      </div>
    </div>
  )
}
