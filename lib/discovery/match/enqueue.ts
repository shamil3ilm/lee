import { after } from 'next/server'
import { logger } from '@/lib/logger'
import { JOB_PRIORITY, JOB_TYPES, jobKeys } from '@/lib/queue/job-types'
import { enqueue } from '@/lib/queue/queue'

/** Budget for draining the backfill right after a profile save. */
const AFTER_SAVE_BUDGET_MS = 30_000

/** Queue one Match Score backfill for the user (a new key per call). */
export async function enqueueMatchJob(userId: string, now: Date = new Date()): Promise<string | null> {
  return enqueue(
    JOB_TYPES.discoveryMatch,
    {},
    {
      userId,
      runAfter: now,
      idempotencyKey: jobKeys.discoveryMatch(userId, `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`),
      priority: JOB_PRIORITY[JOB_TYPES.discoveryMatch],
    },
  )
}

/**
 * After a profile, résumé or preferences save (or a view that ran out of
 * time): queue the backfill and, inside a request, drain it right after the
 * response (Next's `after()`). Outside a request the job waits for the next
 * drain.
 */
export async function queueMatchRescore(userId: string): Promise<void> {
  const id = await enqueueMatchJob(userId)
  if (!id) return
  try {
    after(async () => {
      try {
        const { drain } = await import('@/lib/queue/drain')
        await drain({ userId, types: [JOB_TYPES.discoveryMatch], budgetMs: AFTER_SAVE_BUDGET_MS, maxJobs: 3, concurrency: 1 })
      } catch (err) {
        logger.warn('match_drain_failed', { userId, err: err instanceof Error ? err.message : String(err) })
      }
    })
  } catch {
    // No request scope: the queued job runs on the next drain.
  }
}

/**
 * After any save that can move the score (search preferences, résumé or
 * readiness flags, profile settings, a résumé variant): queue the backfill
 * only when the current key differs from the applied one. Never throws: a
 * failure here must not fail the save; the next Discovery view catches up.
 */
export async function refreshMatchesAfterSave(userId: string): Promise<void> {
  try {
    const [{ get }, { matchStale }, { bestCvStale }] = await Promise.all([
      import('@/lib/db/queries/profile'),
      import('./service'),
      import('@/lib/cv-fit/service'),
    ])
    // The same job also refreshes each posting's best CV (lib/cv-fit), which
    // moves with any résumé or variant change, not only the Match key.
    if (matchStale(await get(userId)) || (await bestCvStale(userId))) await queueMatchRescore(userId)
  } catch (err) {
    logger.warn('match_refresh_failed', { userId, err: err instanceof Error ? err.message : String(err) })
  }
}
