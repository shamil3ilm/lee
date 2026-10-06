/** Formatters shared by the AI usage card and its lazily loaded charts. */

export function formatCost(v: number): string {
  if (v === 0) return '$0.00'
  if (v < 0.01) return '<$0.01'
  return `$${v.toFixed(v < 1 ? 4 : 2)}`
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

/**
 * Axis tick for USD cost: "$0", "$0.002", "$0.25", "$12". Keeps enough
 * precision that sub-cent ticks stay distinct (a free-tier day is often a
 * fraction of a cent).
 */
export function formatCostTick(v: number): string {
  if (v <= 0) return '$0'
  if (v >= 10) return `$${Math.round(v)}`
  if (v >= 0.01) return `$${v.toFixed(2)}`
  const decimals = Math.min(6, Math.ceil(-Math.log10(v)) + 1)
  return `$${v.toFixed(decimals).replace(/\.?0+$/, '')}`
}
