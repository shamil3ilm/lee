import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { runAfterResponse } from '@/lib/server/after-response'
import { isThrottled } from '@/lib/usage/throttle'
import { drain, type DrainOptions } from './drain'

/** At most this many of the visitor's due jobs per visit… */
export const VISIT_DRAIN_MAX_JOBS = 2
/** …within this budget… */
export const VISIT_DRAIN_BUDGET_MS = 20_000
/** …and at most once per this interval per user. */
export const VISIT_DRAIN_INTERVAL_MS = 10 * 60 * 1000

function toRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  const rows = (result as { rows?: unknown } | null)?.rows
  return Array.isArray(rows) ? (rows as T[]) : []
}

/**
 * One statement: when the user has a due job AND their last visit drain is
 * older than the interval, stamp `last_visit_drain_at` and return true.
 * The EXISTS probe uses the (user_id, status, run_after) index; the upsert
 * only happens when there is work, so idle visits write nothing. Two
 * concurrent visits cannot both win: the conditional upsert serializes on
 * the user's state row.
 */
export async function claimVisitDrainSlot(userId: string, now: Date = new Date()): Promise<boolean> {
  const ts = now.toISOString()
  const since = new Date(now.getTime() - VISIT_DRAIN_INTERVAL_MS).toISOString()
  const result = await db.execute(sql`
    insert into queue_user_state (user_id, last_visit_drain_at)
    select ${userId}::uuid, ${ts}::timestamptz
    where exists (
      select 1 from queue_jobs
      where user_id = ${userId}::uuid
        and status in ('queued', 'failed')
        and run_after <= ${ts}::timestamptz
    )
    on conflict (user_id) do update set last_visit_drain_at = excluded.last_visit_drain_at
    where queue_user_state.last_visit_drain_at is null
       or queue_user_state.last_visit_drain_at <= ${since}::timestamptz
    returning user_id
  `)
  return toRows(result).length > 0
}

/**
 * Opportunistic drain on an authed page view. Registers work with Next's
 * `after()` (via runAfterResponse) and returns immediately — nothing runs
 * or queries the DB on the render path. After the response is sent: one
 * cheap indexed check (claimVisitDrainSlot), and only when it wins, a drain
 * of at most VISIT_DRAIN_MAX_JOBS of THIS user's due jobs within
 * VISIT_DRAIN_BUDGET_MS, unless the free-tier throttle is on. Never throws.
 */
export function scheduleVisitDrain(userId: string, opts: Pick<DrainOptions, 'registry'> = {}): Promise<void> {
  return runAfterResponse('queue_visit_drain', async () => {
    if (!(await claimVisitDrainSlot(userId))) return
    // Opportunistic drains are non-essential: skipped at ≥90% Neon
    // compute/egress (lib/usage/throttle). Cron drains still run the jobs.
    if (await isThrottled('pause_nonessential')) return
    await drain({
      userId,
      maxJobs: VISIT_DRAIN_MAX_JOBS,
      budgetMs: VISIT_DRAIN_BUDGET_MS,
      concurrency: 1,
      registry: opts.registry,
    })
  })
}
