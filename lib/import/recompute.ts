import { refreshMatchesAfterSave } from '@/lib/discovery/match/enqueue'
import { queueRelevanceReevaluation } from '@/lib/discovery/relevance/enqueue'
import { reevaluateRelevance } from '@/lib/discovery/relevance/service'
import { logger } from '@/lib/logger'

/** Inline budget for re-gating the inbox; the rest runs in the queued job. */
const INLINE_BUDGET_MS = 3_000

/**
 * SERVER-ONLY. After an import, an undo or a reset: the existing
 * re-evaluation jobs recompute what depends on the profile — relevance
 * (rules key: role suggestions and the inbox gate), Match Scores and each
 * posting's best CV (the match job refreshes both when their keys moved).
 * Never throws: a failure here must not fail the change itself.
 */
export async function recomputeAfterProfileChange(userId: string): Promise<{ relevance: boolean; match: boolean }> {
  let relevance = false
  try {
    const r = await reevaluateRelevance(userId, { deadline: Date.now() + INLINE_BUDGET_MS })
    if (r.remaining) await queueRelevanceReevaluation(userId)
    relevance = true
  } catch (err) {
    logger.warn('profile_recompute_relevance_failed', { userId, err: err instanceof Error ? err.message : String(err) })
  }
  await refreshMatchesAfterSave(userId)
  return { relevance, match: true }
}
