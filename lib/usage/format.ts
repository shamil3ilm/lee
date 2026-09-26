import type { MeterUnit } from './meters'

/** Client-safe number formatting for usage meters. */

const KB = 1024
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const i = Math.min(UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(KB)))
  const v = bytes / KB ** i
  const digits = v >= 100 || i === 0 ? 0 : v >= 10 ? 1 : 2
  return `${Number(v.toFixed(digits))} ${UNITS[i]}`
}

function formatHours(v: number, suffix: string): string {
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2
  return `${Number(v.toFixed(digits))} ${suffix}`
}

export function formatMeterValue(unit: MeterUnit, value: number): string {
  switch (unit) {
    case 'bytes':
      return formatBytes(value)
    case 'cu_hours':
      return formatHours(value, 'CU-h')
    case 'cpu_hours':
      return formatHours(value, 'CPU-h')
    case 'gb_hours':
      return formatHours(value, 'GB-h')
    case 'count':
      return Math.round(value).toLocaleString('en-US')
  }
}

export function formatPercent(fraction: number): string {
  const pct = fraction * 100
  if (pct > 0 && pct < 1) return '<1%'
  return `${Math.round(pct)}%`
}
