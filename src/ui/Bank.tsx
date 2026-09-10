/**
 * The bank you are running, drawn.
 *
 * The whitepaper's own mental model is that a charter is a company and
 * branches are its stores. So the branches are floors: opening one lights a
 * storey, retiring one puts it back in the dark, and closing the last one
 * takes the whole building with it.
 *
 * Pure SVG, no dependency, and it scales with whatever cap the parameters set.
 */
export function BankBuilding({
  branches,
  max,
  dissolved = false,
}: {
  branches: number
  max: number
  dissolved?: boolean
}) {
  const W = 220
  const floorH = 26
  const bodyW = 150
  const x = (W - bodyW) / 2

  const roofH = 34
  const stepsH = 22
  const bodyH = max * floorH
  const H = roofH + bodyH + stepsH + 8

  const bodyTop = roofH
  const groundY = bodyTop + bodyH

  return (
    <svg
      className={`bank-svg ${dissolved ? 'dissolved' : ''}`}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${branches} of ${max} branches open`}
    >
      {/* Pediment and cornice. A bank looks like a bank. */}
      <polygon
        className="roof"
        points={`${W / 2},${roofH - 30} ${x - 14},${roofH - 4} ${x + bodyW + 14},${roofH - 4}`}
      />
      <rect className="cornice" x={x - 14} y={roofH - 4} width={bodyW + 28} height={5} rx={1} />

      {/* The section mark in the pediment, same glyph as the wordmark. */}
      <text className="crest" x={W / 2} y={roofH - 9} textAnchor="middle">
        §
      </text>

      {/* Storeys, counted from the ground so the building fills upward. */}
      {Array.from({ length: max }, (_, i) => {
        const floorIndex = max - 1 - i
        const y = bodyTop + floorIndex * floorH
        const lit = i < branches
        return (
          <g key={i} className={lit ? 'floor lit' : 'floor'}>
            <rect className="slab" x={x} y={y} width={bodyW} height={floorH - 2} rx={1.5} />
            {[0, 1, 2, 3].map((w) => (
              <rect
                key={w}
                className="win"
                x={x + 14 + w * 31}
                y={y + 7}
                width={17}
                height={floorH - 16}
                rx={1}
              />
            ))}
          </g>
        )
      })}

      {/* Steps and the door, always there: the charter itself. */}
      <rect className="plinth" x={x - 8} y={groundY} width={bodyW + 16} height={7} rx={1} />
      <rect className="plinth" x={x - 15} y={groundY + 8} width={bodyW + 30} height={7} rx={1} />
      <rect
        className="door"
        x={W / 2 - 12}
        y={groundY - 17}
        width={24}
        height={17}
        rx={1}
      />
    </svg>
  )
}
