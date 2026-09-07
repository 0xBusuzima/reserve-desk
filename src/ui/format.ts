/** Number formatting for a terminal: short, aligned, and never misleading. */

export function compact(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '-'
  const abs = Math.abs(n)
  if (abs >= 1e12) return (n / 1e12).toFixed(digits) + 'T'
  if (abs >= 1e9) return (n / 1e9).toFixed(digits) + 'B'
  if (abs >= 1e6) return (n / 1e6).toFixed(digits) + 'M'
  if (abs >= 1e3) return (n / 1e3).toFixed(digits) + 'K'
  if (abs >= 1) return n.toFixed(digits)
  if (abs === 0) return '0'
  return n.toPrecision(3)
}

export function int(n: number): string {
  if (!Number.isFinite(n)) return '-'
  return Math.round(n).toLocaleString('en-US')
}

export function pct(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return '-'
  return (x * 100).toFixed(digits) + '%'
}

export function eth(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '-'
  if (Math.abs(n) >= 1000) return compact(n, 1) + ' ETH'
  return n.toFixed(digits) + ' ETH'
}

export function tok(n: number): string {
  return compact(n) + ' $STD'
}

/** Prices run from 1e-7 to 1e-2 ETH across plausible parameter sets. */
export function price(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '-'
  if (n >= 0.001) return n.toFixed(5)
  return n.toExponential(2)
}

export function days(n: number): string {
  if (!Number.isFinite(n)) return 'never'
  if (n >= 365) return (n / 365).toFixed(1) + 'y'
  return n.toFixed(n < 10 ? 1 : 0) + 'd'
}

export function signed(n: number, fmt: (x: number) => string = compact): string {
  return (n > 0 ? '+' : '') + fmt(n)
}
