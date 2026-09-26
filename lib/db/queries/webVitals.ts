import { and, asc, eq, gte, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { webVitalsDaily } from '@/lib/db/schema'
import { singleSampleHistogram, mergeHistograms, type VitalMetric } from '@/lib/vitals/metrics'
import type { VitalsBeacon } from '@/lib/vitals/beacon'

export type WebVitalsRow = typeof webVitalsDaily.$inferSelect

interface MetricAggregate {
  metric: VitalMetric
  count: number
  sum: number
  histogram: number[]
}

/** Fold a beacon's metrics by name (one upsert row per metric). */
export function aggregateBeaconMetrics(metrics: VitalsBeacon['metrics']): MetricAggregate[] {
  const byName = new Map<VitalMetric, MetricAggregate>()
  for (const m of metrics) {
    const prev = byName.get(m.name)
    const one = singleSampleHistogram(m.name, m.value)
    byName.set(m.name, {
      metric: m.name,
      count: (prev?.count ?? 0) + 1,
      sum: (prev?.sum ?? 0) + m.value,
      histogram: prev ? mergeHistograms(prev.histogram, one) : one,
    })
  }
  return [...byName.values()]
}

/** The per-sample dimension counters a beacon adds, e.g. { "device:desktop": n }. */
export function beaconDims(beacon: VitalsBeacon, count: number): Record<string, number> {
  return {
    [`device:${beacon.device}`]: count,
    [`conn:${beacon.connection}`]: count,
    [`nav:${beacon.navigationType}`]: count,
  }
}

/**
 * Add one beacon to the day's aggregates: a single multi-row upsert that sums
 * count, sum, the histogram (element-wise) and the dims counters.
 */
export async function recordBeacon(
  userId: string,
  day: string,
  beacon: VitalsBeacon,
  client: DbClient = db,
): Promise<void> {
  const rows = aggregateBeaconMetrics(beacon.metrics).map((a) => ({
    userId,
    day,
    route: beacon.route,
    metric: a.metric,
    count: a.count,
    sum: a.sum,
    histogram: a.histogram,
    dims: beaconDims(beacon, a.count),
  }))
  if (rows.length === 0) return
  const t = webVitalsDaily
  await client
    .insert(t)
    .values(rows)
    .onConflictDoUpdate({
      target: [t.userId, t.day, t.route, t.metric],
      set: {
        count: sql`${t.count} + excluded.count`,
        sum: sql`${t.sum} + excluded.sum`,
        histogram: sql`array(
          select coalesce(a, 0) + coalesce(b, 0)
          from unnest(${t.histogram}, excluded.histogram) with ordinality as u(a, b, i)
          order by i
        )`,
        dims: sql`(
          select coalesce(jsonb_object_agg(
            k,
            coalesce((${t.dims} ->> k)::int, 0) + coalesce((excluded.dims ->> k)::int, 0)
          ), '{}'::jsonb)
          from (
            select jsonb_object_keys(${t.dims}) union select jsonb_object_keys(excluded.dims)
          ) as keys(k)
        )`,
        updatedAt: sql`now()`,
      },
    })
}

/** Every aggregate row for the user from `sinceDay` (YYYY-MM-DD, inclusive). */
export async function listSince(
  userId: string,
  sinceDay: string,
  client: DbClient = db,
): Promise<WebVitalsRow[]> {
  return client
    .select()
    .from(webVitalsDaily)
    .where(and(eq(webVitalsDaily.userId, userId), gte(webVitalsDaily.day, sinceDay)))
    .orderBy(asc(webVitalsDaily.day))
}
