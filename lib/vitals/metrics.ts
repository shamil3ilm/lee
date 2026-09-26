/**
 * Web vitals definitions shared by the reporter, the /api/vitals route and
 * the Analytics › Performance page.
 *
 * Values are stored as fixed-bucket histograms (see web_vitals_daily), so
 * every bucket bound list below is part of the stored data format: append a
 * new metric freely, but never change an existing metric's bounds without a
 * migration that rewrites its rows.
 */

export const VITAL_METRICS = ['LCP', 'FCP', 'INP', 'CLS', 'TTFB'] as const
export type VitalMetric = (typeof VITAL_METRICS)[number]

export function isVitalMetric(s: string): s is VitalMetric {
  return (VITAL_METRICS as readonly string[]).includes(s)
}

export type VitalRating = 'good' | 'needs-improvement' | 'poor'

/**
 * Google's thresholds (web.dev/articles/vitals): a value at or below `good`
 * is good, at or below `poor` needs improvement, above `poor` is poor.
 */
export const VITAL_THRESHOLDS: Readonly<Record<VitalMetric, { good: number; poor: number }>> = {
  LCP: { good: 2500, poor: 4000 },
  FCP: { good: 1800, poor: 3000 },
  INP: { good: 200, poor: 500 },
  CLS: { good: 0.1, poor: 0.25 },
  TTFB: { good: 800, poor: 1800 },
}

export const VITAL_LABELS: Readonly<Record<VitalMetric, string>> = {
  LCP: 'Largest Contentful Paint',
  FCP: 'First Contentful Paint',
  INP: 'Interaction to Next Paint',
  CLS: 'Cumulative Layout Shift',
  TTFB: 'Time to First Byte',
}

export function rateVital(metric: VitalMetric, value: number): VitalRating {
  const t = VITAL_THRESHOLDS[metric]
  if (value <= t.good) return 'good'
  if (value <= t.poor) return 'needs-improvement'
  return 'poor'
}

/**
 * Upper bounds of each histogram bucket, inclusive; a final open bucket
 * catches everything above the last bound. Every Google threshold is a
 * bound, so good / needs-improvement / poor shares are exact.
 */
const MS_BOUNDS = [
  50, 100, 200, 300, 500, 800, 1000, 1500, 1800, 2000, 2500, 3000, 4000, 5000, 7500, 10000, 15000,
] as const
const CLS_BOUNDS = [
  0.01, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.25, 0.35, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10,
] as const

/** Buckets per histogram: every bound plus the open-ended overflow bucket. */
export const HISTOGRAM_BUCKETS = MS_BOUNDS.length + 1

export function bucketBounds(metric: VitalMetric): readonly number[] {
  return metric === 'CLS' ? CLS_BOUNDS : MS_BOUNDS
}

/** Index of the bucket holding `value` (0-based, < HISTOGRAM_BUCKETS). */
export function bucketIndex(metric: VitalMetric, value: number): number {
  const bounds = bucketBounds(metric)
  const i = bounds.findIndex((b) => value <= b)
  return i === -1 ? bounds.length : i
}

/** A histogram with one sample in `value`'s bucket. */
export function singleSampleHistogram(metric: VitalMetric, value: number): number[] {
  const out = new Array<number>(HISTOGRAM_BUCKETS).fill(0)
  out[bucketIndex(metric, value)] = 1
  return out
}

/** Element-wise sum; missing or short arrays count as zeros. */
export function mergeHistograms(a: readonly number[], b: readonly number[]): number[] {
  return Array.from({ length: HISTOGRAM_BUCKETS }, (_, i) => (a[i] ?? 0) + (b[i] ?? 0))
}

/**
 * Percentile estimate from a histogram, interpolating linearly inside the
 * bucket that holds the rank. The overflow bucket has no upper bound, so a
 * percentile landing there reports the last bound (a floor, flagged by the
 * caller if needed). Returns null for an empty histogram.
 */
export function histogramPercentile(
  metric: VitalMetric,
  histogram: readonly number[],
  p: number,
): number | null {
  const total = histogram.reduce((s, n) => s + n, 0)
  if (total === 0) return null
  const bounds = bucketBounds(metric)
  const rank = p * total
  let seen = 0
  for (let i = 0; i < HISTOGRAM_BUCKETS; i++) {
    const n = histogram[i] ?? 0
    if (n > 0 && seen + n >= rank) {
      if (i >= bounds.length) return bounds[bounds.length - 1]!
      const lower = i === 0 ? 0 : bounds[i - 1]!
      const upper = bounds[i]!
      return lower + ((rank - seen) / n) * (upper - lower)
    }
    seen += n
  }
  return bounds[bounds.length - 1]!
}

/** Share of samples per rating; bucket bounds align with the thresholds. */
export function ratingShares(
  metric: VitalMetric,
  histogram: readonly number[],
): Record<VitalRating, number> {
  const total = histogram.reduce((s, n) => s + n, 0)
  const shares: Record<VitalRating, number> = { good: 0, 'needs-improvement': 0, poor: 0 }
  if (total === 0) return shares
  const bounds = bucketBounds(metric)
  histogram.forEach((n, i) => {
    // A bucket's rating is the rating of its upper bound (or "poor" above
    // the last bound): thresholds are bounds, so no bucket straddles one.
    const rating = i < bounds.length ? rateVital(metric, bounds[i]!) : 'poor'
    shares[rating] += n / total
  })
  return shares
}
