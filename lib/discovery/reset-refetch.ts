import { after } from 'next/server'
import * as sourcesQ from '@/lib/db/queries/sources'
import { logger } from '@/lib/logger'
import { MAX_ERRORS_BEFORE_SKIP } from './service'
import { JOB_PRIORITY, JOB_TYPES } from '@/lib/queue/job-types'
import { enqueueMany } from '@/lib/queue/queue'

/** Wall-clock budget for draining the re-fetch right after a reset. */
const REFETCH_BUDGET_MS = 45_000

/**
 * After "Reset discoveries": queue a fresh poll of the (selected) enabled
 * sources right away, with a per-reset key so it runs even when today's
 * poll already ran, then drain inside the request's `after()` like the
 * first poll of a new source. Progress shows in Settings › Background jobs.
 */
export async function queueRefetch(
  userId: string,
  sourceIds: readonly string[] | null,
  now: Date = new Date(),
): Promise<number> {
  const active = (await sourcesQ.list(userId, { enabled: true })).filter(
    (s) => s.errorCount < MAX_ERRORS_BEFORE_SKIP && (!sourceIds || sourceIds.length === 0 || sourceIds.includes(s.id)),
  )
  const { created } = await enqueueMany(
    active.map((s) => ({
      userId,
      runAfter: now,
      type: JOB_TYPES.discoverySource,
      payload: { sourceId: s.id },
      idempotencyKey: `discovery-source:${userId}:${s.id}:reset-${now.getTime()}`,
      priority: JOB_PRIORITY[JOB_TYPES.discoverySource],
    })),
  )
  if (created === 0) return 0
  try {
    after(async () => {
      try {
        const { drain } = await import('@/lib/queue/drain')
        await drain({ userId, types: [JOB_TYPES.discoverySource], budgetMs: REFETCH_BUDGET_MS, maxJobs: created, concurrency: 1 })
      } catch (err) {
        logger.warn('reset_refetch_drain_failed', { userId, err: err instanceof Error ? err.message : String(err) })
      }
    })
  } catch {
    // No request scope: the queued polls run on the next drain.
  }
  return created
}
