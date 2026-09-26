import { after } from 'next/server'
import { logger } from '@/lib/logger'
import { drain } from '@/lib/queue/drain'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { enqueueSourcePollNow } from '@/lib/queue/scheduler'
import { applyDefaults, type ApplyDefaultsResult } from './apply'

/** Budget for the first searches of newly added default sources. */
const FIRST_POLLS_BUDGET_MS = 60_000
const FIRST_POLLS_CONCURRENCY = 2

/**
 * Apply any pending starter defaults and, when new enabled sources were
 * added, queue their first search and (inside a request) run it right after
 * the response. Outside a request (tests, scripts) the polls are only queued.
 */
export async function ensureDefaults(userId: string, now: Date = new Date()): Promise<ApplyDefaultsResult> {
  const result = await applyDefaults(userId)
  if (result.enabledSourceIds.length === 0) return result

  for (const sourceId of result.enabledSourceIds) {
    await enqueueSourcePollNow(userId, sourceId, now)
  }
  try {
    after(async () => {
      try {
        await drain({
          userId,
          types: [JOB_TYPES.discoverySource],
          budgetMs: FIRST_POLLS_BUDGET_MS,
          maxJobs: result.enabledSourceIds.length,
          concurrency: FIRST_POLLS_CONCURRENCY,
        })
      } catch (err) {
        logger.warn('defaults_first_polls_failed', {
          userId,
          err: err instanceof Error ? err.message : String(err),
        })
      }
    })
  } catch {
    // No request scope: the queued polls run on the next drain.
  }
  return result
}
