import type { VitalMetric, VitalRating } from '@/lib/vitals/metrics'

/** "1.8 s", "240 ms", "0.05"; an em dash when there is no data. */
export function formatVital(metric: VitalMetric, value: number | null): string {
  if (value === null) return '—'
  if (metric === 'CLS') return value.toFixed(2)
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`
  return `${Math.round(value)} ms`
}

export const RATING_LABEL: Readonly<Record<VitalRating, string>> = {
  good: 'Good',
  'needs-improvement': 'Needs improvement',
  poor: 'Poor',
}

/** Text + soft background classes per rating (design tokens from globals.css). */
export const RATING_CLASS: Readonly<Record<VitalRating, string>> = {
  good: 'bg-success-soft text-success',
  'needs-improvement': 'bg-warning-soft text-warning',
  poor: 'bg-danger-soft text-danger',
}

export const RATING_BAR_CLASS: Readonly<Record<VitalRating, string>> = {
  good: 'bg-success',
  'needs-improvement': 'bg-warning',
  poor: 'bg-danger',
}
