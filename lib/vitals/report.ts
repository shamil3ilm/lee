import {
  histogramPercentile,
  isVitalMetric,
  mergeHistograms,
  rateVital,
  ratingShares,
  VITAL_METRICS,
  type VitalMetric,
  type VitalRating,
} from './metrics'

/**
 * Turns web_vitals_daily rows into what Analytics › Performance shows:
 * per-route p75 for each metric, an overall p75 with the rating split, and a
 * daily p75 trend per metric. Pure, so it is unit-tested without a database.
 */

export interface VitalsAggregateRow {
  day: string
  route: string
  metric: string
  count: number
  histogram: number[]
  dims: Record<string, number>
}

export interface MetricSummary {
  p75: number | null
  rating: VitalRating | null
  count: number
}

export interface RouteSummary {
  route: string
  /** Page loads seen on this route (its TTFB samples, else its largest count). */
  loads: number
  metrics: Record<VitalMetric, MetricSummary>
}

export interface OverallSummary extends MetricSummary {
  metric: VitalMetric
  shares: Record<VitalRating, number>
}

export interface TrendPoint {
  day: string
  p75: number | null
  count: number
}

export interface VitalsReport {
  overall: OverallSummary[]
  routes: RouteSummary[]
  trend: Record<VitalMetric, TrendPoint[]>
  /** Share of page loads per dimension value, e.g. { "device:desktop": 0.9 }. */
  dims: Record<string, number>
  totalLoads: number
}

function summarize(metric: VitalMetric, histogram: number[], count: number): MetricSummary {
  const p75 = histogramPercentile(metric, histogram, 0.75)
  return { p75, rating: p75 === null ? null : rateVital(metric, p75), count }
}

function emptyByMetric<T>(make: () => T): Record<VitalMetric, T> {
  return Object.fromEntries(VITAL_METRICS.map((m) => [m, make()])) as Record<VitalMetric, T>
}

interface Acc {
  histogram: number[]
  count: number
}

/** Local accumulation only: `map` is built and read inside buildVitalsReport. */
function addTo(map: Map<string, Acc>, key: string, row: VitalsAggregateRow): void {
  const prev = map.get(key)
  map.set(key, {
    histogram: prev ? mergeHistograms(prev.histogram, row.histogram) : [...row.histogram],
    count: (prev?.count ?? 0) + row.count,
  })
}

/** Every UTC day from `fromDay` to `toDay` inclusive, as YYYY-MM-DD. */
export function daysBetween(fromDay: string, toDay: string): string[] {
  const out: string[] = []
  const end = Date.parse(`${toDay}T00:00:00Z`)
  for (let t = Date.parse(`${fromDay}T00:00:00Z`); t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

export function buildVitalsReport(
  rows: readonly VitalsAggregateRow[],
  window: { fromDay: string; toDay: string },
): VitalsReport {
  const valid = rows.filter(
    (r): r is VitalsAggregateRow & { metric: VitalMetric } => isVitalMetric(r.metric),
  )
  const byMetric = new Map<string, Acc>()
  const byRouteMetric = new Map<string, Acc>()
  const byDayMetric = new Map<string, Acc>()
  const dimCounts = new Map<string, number>()
  for (const r of valid) {
    addTo(byMetric, r.metric, r)
    addTo(byRouteMetric, `${r.route}\u0000${r.metric}`, r)
    addTo(byDayMetric, `${r.day}\u0000${r.metric}`, r)
    // TTFB is reported once per page load, so its dims count loads.
    if (r.metric === 'TTFB') {
      for (const [k, n] of Object.entries(r.dims)) dimCounts.set(k, (dimCounts.get(k) ?? 0) + n)
    }
  }

  const overall: OverallSummary[] = VITAL_METRICS.map((metric) => {
    const acc = byMetric.get(metric) ?? { histogram: [], count: 0 }
    return { metric, ...summarize(metric, acc.histogram, acc.count), shares: ratingShares(metric, acc.histogram) }
  })

  const routeNames = [...new Set(valid.map((r) => r.route))]
  const routes: RouteSummary[] = routeNames
    .map((route) => {
      const metrics = emptyByMetric<MetricSummary>(() => ({ p75: null, rating: null, count: 0 }))
      for (const metric of VITAL_METRICS) {
        const acc = byRouteMetric.get(`${route}\u0000${metric}`)
        if (acc) metrics[metric] = summarize(metric, acc.histogram, acc.count)
      }
      const loads = metrics.TTFB.count || Math.max(...VITAL_METRICS.map((m) => metrics[m].count))
      return { route, loads, metrics }
    })
    .sort((a, b) => b.loads - a.loads || a.route.localeCompare(b.route))

  const days = daysBetween(window.fromDay, window.toDay)
  const trend = emptyByMetric<TrendPoint[]>(() => [])
  for (const metric of VITAL_METRICS) {
    trend[metric] = days.map((day) => {
      const acc = byDayMetric.get(`${day}\u0000${metric}`)
      return {
        day,
        p75: acc ? histogramPercentile(metric, acc.histogram, 0.75) : null,
        count: acc?.count ?? 0,
      }
    })
  }

  const totalLoads = byMetric.get('TTFB')?.count ?? 0
  const dims = Object.fromEntries(
    [...dimCounts.entries()].map(([k, n]) => [k, totalLoads > 0 ? n / totalLoads : 0]),
  )
  return { overall, routes, trend, dims, totalLoads }
}
