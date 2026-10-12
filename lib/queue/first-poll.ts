import { after } from 'next/server'
import { logger } from '@/lib/logger'
import { drain } from './drain'
import { JOB_TYPES } from './job-types'
import { enqueueSourcePolls } from './scheduler'

/** Wall-clock budget for the first poll run after a source is added. */
const FIRST_POLL_BUDGET_MS = 45_000

/**
 * Queue a poll of a just-added (or re-enabled) source and, inside a request,
 * run THAT poll right after the response (the drain targets its job id, not
 * the user's oldest poll), so the first discoveries appear within a minute
 * instead of at the next daily scheduler run. When the source already has a
 * pending poll (e.g. queued days ago behind a backlog), that one is pulled
 * forward and run instead of queuing another.
 *
 * Uses Next's `after()` directly (not runAfterResponse): outside a request —
 * tests, scripts — the job is only queued and runs on the next drain, so no
 * job-board network calls happen inline.
 *
 * Returns true when a new poll job was inserted.
 */
export async function queueFirstPoll(userId: string, sourceId: string, now: Date = new Date()): Promise<boolean> {
  const { created, jobIds } = await enqueueSourcePolls(userId, [sourceId], now)
  if (jobIds.length === 0) return false
  logger.info('source_first_poll_queued', { userId, sourceId })
  try {
    after(async () => {
      try {
        await drain({
          userId,
          types: [JOB_TYPES.discoverySource],
          jobIds,
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
  return created > 0
}
