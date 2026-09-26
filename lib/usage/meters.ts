import {
  ASSET_STORAGE_LIMIT,
  NEON_COMPUTE_LIMIT,
  NEON_EGRESS_LIMIT,
  NEON_STORAGE_LIMIT,
  PLAYGROUND_ENGINE_BUDGET,
  USAGE_CRITICAL,
  USAGE_WARN,
  VERCEL_ACTIVE_CPU_LIMIT,
  VERCEL_FAST_TRANSFER_LIMIT,
  VERCEL_INVOCATIONS_LIMIT,
  VERCEL_MEMORY_LIMIT,
  VERCEL_ORIGIN_TRANSFER_LIMIT,
  type FreeTierLimit,
} from './limits'

/**
 * Meter catalogue and the pure math behind Settings › Usage (client-safe).
 * A snapshot stores only readings (id, used, source); limits, labels and
 * levels come from here so a limit change never needs a data migration.
 */

export const GLOBAL_METER_IDS = [
  'neon_storage',
  'neon_compute',
  'neon_egress',
  'vercel_invocations',
  'vercel_active_cpu',
  'vercel_memory',
  'vercel_fast_transfer',
  'vercel_origin_transfer',
  'jobs_run',
  'queue_backlog',
  'queue_dead',
  'playground_assets',
] as const
export const USER_METER_IDS = ['asset_storage'] as const

export type GlobalMeterId = (typeof GLOBAL_METER_IDS)[number]
export type UserMeterId = (typeof USER_METER_IDS)[number]
export type MeterId = GlobalMeterId | UserMeterId

/**
 * Where a number came from:
 * - measured: our own database (pg_database_size, row counts);
 * - neon_api: the Neon API project usage fields;
 * - estimated: derived, not reported by the vendor;
 * - unavailable: needs an optional key that is not set (or the call failed);
 * - vendor_dashboard: the vendor exposes no API for it on this plan;
 * - placeholder: nothing to measure yet.
 */
export type MeterSource =
  | 'measured'
  | 'neon_api'
  | 'estimated'
  | 'unavailable'
  | 'vendor_dashboard'
  | 'placeholder'

export interface MeterReading {
  id: MeterId
  /** Null when the value is not known (see `source`). */
  used: number | null
  source: MeterSource
}

export type MeterUnit = 'bytes' | 'cu_hours' | 'count' | 'cpu_hours' | 'gb_hours'

export interface MeterDef {
  id: MeterId
  label: string
  group: 'neon' | 'vercel' | 'app'
  unit: MeterUnit
  /** Null for info-only counts (no hard limit). */
  limit: FreeTierLimit | null
  /** Level meters (storage) trend up or down; monthly ones reset. */
  kind: 'monthly' | 'level'
  /** Counts toward the dashboard banner, todos and digest warnings. */
  warns: boolean
  help: string
}

const def = (d: MeterDef): MeterDef => d

export const METER_DEFS: Readonly<Record<MeterId, MeterDef>> = {
  neon_storage: def({
    id: 'neon_storage',
    label: 'Database storage',
    group: 'neon',
    unit: 'bytes',
    limit: NEON_STORAGE_LIMIT,
    kind: 'level',
    warns: true,
    help: 'pg_database_size of this database. At the cap, writes fail until space is freed.',
  }),
  neon_compute: def({
    id: 'neon_compute',
    label: 'Compute (CU-hours)',
    group: 'neon',
    unit: 'cu_hours',
    limit: NEON_COMPUTE_LIMIT,
    kind: 'monthly',
    warns: true,
    help: 'Compute time this billing period. When exhausted, Neon suspends the database until next month.',
  }),
  neon_egress: def({
    id: 'neon_egress',
    label: 'Egress (data transfer)',
    group: 'neon',
    unit: 'bytes',
    limit: NEON_EGRESS_LIMIT,
    kind: 'monthly',
    warns: true,
    help: 'Data sent from Neon to the app this billing period. When exhausted, the database is suspended.',
  }),
  vercel_invocations: def({
    id: 'vercel_invocations',
    label: 'Function invocations',
    group: 'vercel',
    unit: 'count',
    limit: VERCEL_INVOCATIONS_LIMIT,
    kind: 'monthly',
    warns: true,
    help: 'Every server request and cron run.',
  }),
  vercel_active_cpu: def({
    id: 'vercel_active_cpu',
    label: 'Active CPU',
    group: 'vercel',
    unit: 'cpu_hours',
    limit: VERCEL_ACTIVE_CPU_LIMIT,
    kind: 'monthly',
    warns: true,
    help: 'CPU time while functions compute (waiting on the database or AI does not count).',
  }),
  vercel_memory: def({
    id: 'vercel_memory',
    label: 'Provisioned memory',
    group: 'vercel',
    unit: 'gb_hours',
    limit: VERCEL_MEMORY_LIMIT,
    kind: 'monthly',
    warns: true,
    help: 'Memory × wall-clock time of running functions.',
  }),
  vercel_fast_transfer: def({
    id: 'vercel_fast_transfer',
    label: 'Fast data transfer',
    group: 'vercel',
    unit: 'bytes',
    limit: VERCEL_FAST_TRANSFER_LIMIT,
    kind: 'monthly',
    warns: true,
    help: 'Bytes sent from Vercel to browsers.',
  }),
  vercel_origin_transfer: def({
    id: 'vercel_origin_transfer',
    label: 'Fast origin transfer',
    group: 'vercel',
    unit: 'bytes',
    limit: VERCEL_ORIGIN_TRANSFER_LIMIT,
    kind: 'monthly',
    warns: true,
    help: 'Bytes between the CDN and functions.',
  }),
  jobs_run: def({
    id: 'jobs_run',
    label: 'Background jobs run (last 14 days)',
    group: 'app',
    unit: 'count',
    limit: null,
    kind: 'level',
    warns: false,
    help: 'Our own count of finished queue jobs. Not Vercel invocations or CPU: see the Vercel dashboard for those.',
  }),
  queue_backlog: def({
    id: 'queue_backlog',
    label: 'Queue backlog',
    group: 'app',
    unit: 'count',
    limit: null,
    kind: 'level',
    warns: false,
    help: 'Jobs waiting to run or retry.',
  }),
  queue_dead: def({
    id: 'queue_dead',
    label: 'Jobs that gave up',
    group: 'app',
    unit: 'count',
    limit: null,
    kind: 'level',
    warns: false,
    help: 'Retry them from Settings › Background jobs.',
  }),
  playground_assets: def({
    id: 'playground_assets',
    label: 'Playground engine assets',
    group: 'app',
    unit: 'bytes',
    limit: PLAYGROUND_ENGINE_BUDGET,
    kind: 'level',
    warns: false,
    help: 'Budget for self-hosted engine files (v86, Pyodide, PGlite). None ship yet.',
  }),
  asset_storage: def({
    id: 'asset_storage',
    label: 'Your document files',
    group: 'app',
    unit: 'bytes',
    limit: ASSET_STORAGE_LIMIT,
    kind: 'level',
    warns: true,
    help: 'Files you uploaded to LaTeX documents and kept in the database.',
  }),
}

export type MeterLevel = 'ok' | 'warn' | 'critical' | 'unknown'

export function meterFraction(used: number | null, limit: number | null): number | null {
  if (used === null || limit === null || limit <= 0) return null
  return Math.max(0, used / limit)
}

export function meterLevel(fraction: number | null): MeterLevel {
  if (fraction === null) return 'unknown'
  if (fraction >= USAGE_CRITICAL) return 'critical'
  if (fraction >= USAGE_WARN) return 'warn'
  return 'ok'
}

/** Highest crossed threshold (70 or 90), or null. */
export function crossedThreshold(fraction: number | null): 70 | 90 | null {
  if (fraction === null) return null
  if (fraction >= USAGE_CRITICAL) return 90
  if (fraction >= USAGE_WARN) return 70
  return null
}

const DAY_MS = 86_400_000

/** yyyy-mm (UTC) — the period warnings are deduped by. */
export function utcPeriod(now: Date): string {
  return now.toISOString().slice(0, 7)
}

function dayStart(day: string): number {
  return Date.parse(`${day}T00:00:00Z`)
}

function monthBounds(now: Date): { start: number; end: number } {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
  return { start, end }
}

export interface TrendPoint {
  /** yyyy-mm-dd (UTC) */
  day: string
  used: number
}

/** Days of trend a level meter (storage) projects from. */
export const LEVEL_TREND_DAYS = 14

/**
 * Projected value at the end of the current UTC month from the daily trend.
 * - monthly meters (reset each period): points from this month only; with
 *   one point the rate is its value over the days elapsed this month;
 * - level meters (storage): slope over the last LEVEL_TREND_DAYS days.
 * Returns null when there is not enough data. Never below zero.
 */
export function projectEndOfMonth(
  points: readonly TrendPoint[],
  kind: 'monthly' | 'level',
  now: Date,
): number | null {
  const { start, end } = monthBounds(now)
  const nowMs = now.getTime()
  const windowStart = kind === 'monthly' ? start : nowMs - LEVEL_TREND_DAYS * DAY_MS
  const pts = points
    .filter((p) => {
      const t = dayStart(p.day)
      return Number.isFinite(p.used) && Number.isFinite(t) && t >= windowStart && t <= nowMs
    })
    .sort((a, b) => a.day.localeCompare(b.day))
  const last = pts.at(-1)
  if (!last) return null
  const remainingDays = Math.max(0, (end - nowMs) / DAY_MS)
  const first = pts[0] as TrendPoint
  const spanDays = (dayStart(last.day) - dayStart(first.day)) / DAY_MS
  let perDay: number
  if (pts.length >= 2 && spanDays > 0) {
    perDay = (last.used - first.used) / spanDays
  } else if (kind === 'monthly') {
    const elapsedDays = Math.max(1, (nowMs - start) / DAY_MS)
    perDay = last.used / elapsedDays
  } else {
    return last.used
  }
  return Math.max(0, last.used + perDay * remainingDays)
}
