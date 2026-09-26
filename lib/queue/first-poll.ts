import { after } from 'next/server'
import { logger } from '@/lib/logger'
import { drain } from './drain'
import { JOB_TYPES } from './job-types'
import { enqueueSourcePollNow } from './scheduler'

/** Wall-clock budget for the first poll run after a source is added. */
const FIRST_POLL_BUDGET_MS = 45_000

/**
 * Queue today's poll for a just-added (or re-enabled) source and, inside a
 * request, run it right after the response so the first discoveries appear
 * within a minute instead of at the next daily scheduler run.
 *
 * Uses Next's `after()` directly (not runAfterResponse): outside a request —
 * tests, scripts — the job is only queued and runs on the next drain, so no
 * job-board network calls happen inline.
 */
export async function queueFirstPoll(userId: string, sourceId: string, now: Date = new Date()): Promise<boolean> {
  const queued = await enqueueSourcePollNow(userId, sourceId, now)
  if (!queued) return false
  try {
    after(async () => {
      try {
        await drain({
          userId,
          types: [JOB_TYPES.discoverySource],
          budgetMs: FIRST_POLL_BUDGET_MS,
          maxJobs: 1,
          concurrency: 1,
        })
      } catch (err) {
        logger.warn('first_poll_drain_failed', {
          userId,
          sourceId,
          err: err instanceof Error ? err.message : String(err),
        })
      }
    })
  } catch {
    // No request scope: the queued job runs on the next drain.
  }
  return true
}
