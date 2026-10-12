import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { MAX_ERRORS_BEFORE_SKIP } from '@/lib/discovery/service'
import { logger } from '@/lib/logger'
import { JOB_TYPES } from './job-types'

/**
 * Guards for the 2026-10-12 incident (enabled sources never polled behind a
 * poll backlog): which of a user's sources are overdue (Settings › Sources ›
 * Coverage), and a warning when the queued polls outnumber the sources.
 * Overdue sources need no special handling in the queue: the claim order
 * takes never-polled, then the stalest sources first (lib/queue/queue.ts).
 */

/** Daily polls plus a couple of hours of drain slack. */
export const OVERDUE_POLL_HOURS = 26

export interface OverdueSource {
  id: string
  name: string
  lastPolledAt: Date | null
  /** When the pending poll was first queued; null when none is queued. */
  queuedSince: Date | null
}

function toRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  const rows = (result as { rows?: unknown } | null)?.rows
  return Array.isArray(rows) ? (rows as T[]) : []
}

const toDate = (v: Date | string | null): Date | null => (v === null ? null : new Date(v))

/**
 * Enabled, pollable sources (not watch links or job-alert email, not given
 * up on after repeated errors) with no poll for OVERDUE_POLL_HOURS — counted
 * from when they were added if they were never polled. Never polled first.
 */
export async function overdueSources(userId: string, now: Date = new Date()): Promise<OverdueSource[]> {
  const since = new Date(now.getTime() - OVERDUE_POLL_HOURS * 3_600_000).toISOString()
  const result = await db.execute(sql`
    select s.id, s.name, s.last_polled_at,
           (select min(q.created_at) from queue_jobs q
             where q.type = ${JOB_TYPES.discoverySource} and q.user_id = s.user_id
               and q.status in ('queued', 'failed') and q.payload->>'sourceId' = s.id::text) as queued_since
    from sources s
    where s.user_id = ${userId}::uuid and s.enabled
      and s.kind not in ('watch', 'email_alert')
      and s.error_count < ${MAX_ERRORS_BEFORE_SKIP}
      and coalesce(s.last_polled_at, s.created_at) < ${since}::timestamptz
    order by s.last_polled_at asc nulls first, s.created_at, s.id
  `)
  return toRows<{ id: string; name: string; last_polled_at: Date | string | null; queued_since: Date | string | null }>(result).map((r) => ({
    id: r.id,
    name: r.name,
    lastPolledAt: toDate(r.last_polled_at),
    queuedSince: toDate(r.queued_since),
  }))
}

export interface PollBacklog {
  userId: string
  pending: number
  enabled: number
}

/**
 * Users whose queued/failed source polls outnumber their enabled sources —
 * impossible while polls coalesce (one pending poll per source), so any hit
 * means the queue is piling up again. Logged as `queue_poll_backlog`.
 */
export async function warnPollBacklog(): Promise<PollBacklog[]> {
  try {
    const result = await db.execute(sql`
      select q.user_id, count(*)::int as pending,
             (select count(*)::int from sources s where s.user_id = q.user_id and s.enabled) as enabled
      from queue_jobs q
      where q.type = ${JOB_TYPES.discoverySource} and q.status in ('queued', 'failed') and q.user_id is not null
      group by q.user_id
    `)
    const over = toRows<{ user_id: string; pending: number | string; enabled: number | string }>(result)
      .map((r) => ({ userId: r.user_id, pending: Number(r.pending), enabled: Number(r.enabled) }))
      .filter((r) => r.pending > r.enabled)
    for (const r of over) logger.warn('queue_poll_backlog', r)
    return over
  } catch (err) {
    logger.warn('queue_poll_backlog_check_failed', { err: err instanceof Error ? err.message : String(err) })
    return []
  }
}
