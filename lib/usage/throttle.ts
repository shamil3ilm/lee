import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { logger } from '@/lib/logger'
import { USAGE_CRITICAL } from './limits'
import { meterFraction, utcPeriod, METER_DEFS, type MeterReading } from './meters'

/**
 * Automatic throttles before a Neon hard stop (v17 §9.6 item 7). Each one is
 * computed from the latest usage snapshot, applies only within the UTC
 * month of that snapshot (a new month lifts it), and lifts itself when the
 * next snapshot is back under 90 %. The owner can also resume paused jobs
 * for the rest of the month from Settings › Usage.
 *
 * - pause_nonessential (Neon CU-hours or egress ≥ 90 %): skip Scam Shield
 *   re-checks, discovery polls beyond the first run of the day (retries),
 *   and opportunistic page-visit drains. Reminders, follow-ups, Gmail sync,
 *   digests and the first discovery poll keep running.
 * - early_retention (DB storage ≥ 90 %): the snapshot job runs the
 *   retention compaction right away instead of waiting for its nightly cron.
 */
export const THROTTLE_IDS = ['pause_nonessential', 'early_retention'] as const
export type ThrottleId = (typeof THROTTLE_IDS)[number]

export const THROTTLE_COPY: Readonly<Record<ThrottleId, { title: string; detail: string }>> = {
  pause_nonessential: {
    title: 'Non-essential background jobs paused',
    detail:
      'Neon compute or egress is at 90% or more. Scam Shield re-checks, discovery retries and page-visit job runs are skipped until usage drops or the month resets. Reminders, follow-ups, Gmail sync, digests and the daily discovery poll keep running.',
  },
  early_retention: {
    title: 'Storage clean-up ran early',
    detail:
      'Database storage is at 90% or more, so retention compaction runs with every snapshot instead of once a night. Consider exporting or archiving old data.',
  },
}

function atCritical(readings: readonly MeterReading[], id: MeterReading['id']): boolean {
  const r = readings.find((x) => x.id === id)
  const limit = METER_DEFS[id].limit?.value ?? null
  const f = meterFraction(r?.used ?? null, limit)
  return f !== null && f >= USAGE_CRITICAL
}

/** Pure: which throttles a set of global readings calls for. */
export function evaluateThrottles(readings: readonly MeterReading[]): ThrottleId[] {
  const out: ThrottleId[] = []
  if (atCritical(readings, 'neon_compute') || atCritical(readings, 'neon_egress')) out.push('pause_nonessential')
  if (atCritical(readings, 'neon_storage')) out.push('early_retention')
  return out
}

export interface ThrottleState {
  /** Throttles in force right now (after the owner's resume, if any). */
  active: ReadonlySet<ThrottleId>
  /** Throttles the latest snapshot asked for, before any resume. */
  requested: ReadonlySet<ThrottleId>
  resumed: boolean
}

const NONE: ThrottleState = { active: new Set(), requested: new Set(), resumed: false }

function toRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  const rows = (result as { rows?: unknown } | null)?.rows
  return Array.isArray(rows) ? (rows as T[]) : []
}

/** Pure: combine a snapshot's throttles with the month and the resume flag. */
export function resolveThrottles(args: {
  snapshotDay: string | null
  throttles: readonly string[]
  resumed: boolean
  now: Date
}): ThrottleState {
  if (!args.snapshotDay || args.snapshotDay.slice(0, 7) !== utcPeriod(args.now)) {
    return { ...NONE, resumed: args.resumed }
  }
  const requested = new Set(
    args.throttles.filter((t): t is ThrottleId => (THROTTLE_IDS as readonly string[]).includes(t)),
  )
  const active = new Set([...requested].filter((t) => !(args.resumed && t === 'pause_nonessential')))
  return { active, requested, resumed: args.resumed }
}

/** One indexed read: the latest snapshot's throttles + this month's resume. */
export async function loadThrottleState(now: Date = new Date()): Promise<ThrottleState> {
  const period = utcPeriod(now)
  const result = await db.execute(sql`
    select
      (select day from usage_snapshots order by day desc limit 1) as day,
      (select throttles from usage_snapshots order by day desc limit 1) as throttles,
      exists (select 1 from usage_settings where throttles_resumed_period = ${period}) as resumed
  `)
  const row = toRows<{ day: string | null; throttles: string[] | string | null; resumed: boolean }>(result)[0]
  const throttles = Array.isArray(row?.throttles) ? row.throttles : parsePgArray(row?.throttles ?? null)
  return resolveThrottles({ snapshotDay: row?.day ?? null, throttles, resumed: Boolean(row?.resumed), now })
}

function parsePgArray(v: string | null): string[] {
  if (!v || v === '{}') return []
  return v.replace(/^\{|\}$/g, '').split(',').filter(Boolean)
}

/** Cache for the drain's per-job checks: one query per minute at most. */
const CACHE_MS = 60_000
let cached: { at: number; state: ThrottleState } | null = null

export function clearThrottleCache(): void {
  cached = null
}

/**
 * Throttles in force, cached briefly. Never throws: on a read error the
 * app runs unthrottled (a throttle must never take a feature down).
 */
export async function activeThrottles(now: Date = new Date()): Promise<ReadonlySet<ThrottleId>> {
  if (cached && now.getTime() - cached.at < CACHE_MS) return cached.state.active
  try {
    const state = await loadThrottleState(now)
    cached = { at: now.getTime(), state }
    return state.active
  } catch (err) {
    logger.warn('usage_throttle_read_failed', { err: err instanceof Error ? err.message : String(err) })
    return NONE.active
  }
}

export async function isThrottled(id: ThrottleId, now: Date = new Date()): Promise<boolean> {
  return (await activeThrottles(now)).has(id)
}
