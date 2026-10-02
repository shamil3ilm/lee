import { after } from 'next/server'
import { logger } from '@/lib/logger'
import { JOB_PRIORITY, JOB_TYPES, jobKeys } from '@/lib/queue/job-types'
import { enqueue } from '@/lib/queue/queue'

/** Budget for draining the re-evaluation right after a preferences save. */
const AFTER_SAVE_BUDGET_MS = 30_000

/** Queue one relevance re-evaluation for the user (a new key per call). */
export async function enqueueRelevanceJob(userId: string, now: Date = new Date()): Promise<string | null> {
  return enqueue(
    JOB_TYPES.discoveryRelevance,
    {},
    {
      userId,
      runAfter: now,
      idempotencyKey: jobKeys.discoveryRelevance(userId, `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`),
      priority: JOB_PRIORITY[JOB_TYPES.discoveryRelevance],
    },
  )
}

/**
 * After a preferences save: queue the re-evaluation and, inside a request,
 * drain it right after the response (Next's `after()`), so the inbox is
 * re-gated within seconds. Outside a request (tests, scripts) the job only
 * waits for the next drain.
 */
export async function queueRelevanceReevaluation(userId: string): Promise<void> {
  const id = await enqueueRelevanceJob(userId)
  if (!id) return
  try {
    after(async () => {
      try {
        const { drain } = await import('@/lib/queue/drain')
        await drain({
          userId,
          types: [JOB_TYPES.discoveryRelevance],
          budgetMs: AFTER_SAVE_BUDGET_MS,
          maxJobs: 3,
          concurrency: 1,
        })
      } catch (err) {
        logger.warn('relevance_drain_failed', { userId, err: err instanceof Error ? err.message : String(err) })
      }
    })
  } catch {
    // No request scope: the queued job runs on the next drain.
  }
}
