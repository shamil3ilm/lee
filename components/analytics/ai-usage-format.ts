/** Formatters shared by the AI usage card and its lazily loaded charts. */

export function formatCost(v: number): string {
  if (v === 0) return '$0.00'
  if (v < 0.01) return '<$0.01'
  return `$${v.toFixed(v < 1 ? 4 : 2)}`
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}
