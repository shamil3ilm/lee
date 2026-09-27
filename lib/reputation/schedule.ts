import * as repQ from '@/lib/db/queries/companyReputation'
import { drain } from '@/lib/queue/drain'
import { JOB_PRIORITY, JOB_TYPES, jobKeys } from '@/lib/queue/job-types'
import { enqueueMany } from '@/lib/queue/queue'

/**
 * Reputation refresh planning. Weekly: watched companies whose signals are
 * missing or older than 7 days, oldest first, at most
 * WEEKLY_REFRESH_PER_DAY a day (spreads the load and the GDELT rate limit
 * across the week). On demand: the panel's Refresh, at most once an hour
 * per company, claimed ahead of other due jobs and drained right away.
 */

export const WEEKLY_REFRESH_PER_DAY = 20
export const REFRESH_AFTER_DAYS = 7
export const REPUTATION_MANUAL_PRIORITY = 15
/** Budget for the on-demand drain (the GDELT spacing can add ~6 s). */
export const MANUAL_DRAIN_BUDGET_MS = 40_000
const DAY_MS = 24 * 60 * 60 * 1000

/** ISO-8601 week, e.g. `2026-W39`. */
export function isoWeek(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export async function scheduleReputationRefresh(
  now: Date = new Date(),
  limit: number = WEEKLY_REFRESH_PER_DAY,
): Promise<{ planned: number; enqueued: number }> {
  const stale = await repQ.staleWatched(new Date(now.getTime() - REFRESH_AFTER_DAYS * DAY_MS), limit)
  const week = isoWeek(now)
  const { created } = await enqueueMany(
    stale.map((c) => ({
      type: JOB_TYPES.companyReputation,
      userId: c.userId,
      runAfter: now,
      payload: { companyId: c.companyId, trigger: 'weekly' },
      idempotencyKey: jobKeys.companyReputationWeekly(c.userId, c.companyId, week),
      priority: JOB_PRIORITY[JOB_TYPES.companyReputation],
      maxAttempts: 3,
    })),
  )
  return { planned: stale.length, enqueued: created }
}

export type ManualRefresh = { status: 'done'; failed: boolean } | { status: 'recent' } | { status: 'queued' }

/**
 * Enqueue an on-demand refresh and run it now. `recent` when this hour's
 * refresh was already queued; `queued` when the drain ran out of budget
 * (the job then runs on the next drain).
 */
export async function refreshNow(userId: string, companyId: string, now: Date = new Date()): Promise<ManualRefresh> {
  const hour = now.toISOString().slice(0, 13)
  const { created } = await enqueueMany([
    {
      type: JOB_TYPES.companyReputation,
      userId,
      runAfter: now,
      payload: { companyId, trigger: 'manual' },
      idempotencyKey: jobKeys.companyReputationManual(userId, companyId, hour),
      priority: REPUTATION_MANUAL_PRIORITY,
      maxAttempts: 2,
    },
  ])
  if (created === 0) return { status: 'recent' }
  const r = await drain({
    userId,
    types: [JOB_TYPES.companyReputation],
    maxJobs: 1,
    budgetMs: MANUAL_DRAIN_BUDGET_MS,
    concurrency: 1,
  })
  if (r.done + r.failed + r.dead === 0) return { status: 'queued' }
  return { status: 'done', failed: r.done === 0 }
}
