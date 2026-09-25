/** v14 — tiny display formatters for Lab metrics (client-safe, pure). */

export function fmtMs(ms: number | undefined | null): string {
  if (ms === undefined || ms === null || !Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`
}

export function fmtNum(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '—'
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n * 10) / 10)
}

export function fmtPct(x: number): string {
  return `${Math.round(x * 100)}%`
}

export function fmtContext(n: number | undefined): string {
  if (!n) return ''
  return n >= 1000 ? `${Math.round(n / 1000)}k ctx` : `${n} ctx`
}
