import { JOB_TYPES } from './job-types'

/**
 * One pending job per subject (incident 2026-10-12: discovery polls piled up
 * one per source per day behind a drain backlog, and a stale poll blocked
 * every later Scam Shield → shortlist → email chain).
 *
 * A job's `coalesce_key` names what it is about — `user:source` for a source
 * poll, `user` for a per-user daily step. The partial unique index
 * `queue_jobs_pending_coalesce_uq` allows at most one queued/failed job per
 * (type, coalesce_key). How a new job meets a pending one depends on the type:
 *
 *  - `merge`: the new job is folded into the pending one (its run_after and
 *    priority are pulled forward). A source poll is a poll: a new day's plan,
 *    a first poll or a re-fetch all mean "poll this source soon".
 *  - `replace`: the pending one is marked `superseded` and the new one is
 *    queued. Today's shortlist replaces yesterday's unfinished one; a newer
 *    preferences save replaces an older relevance re-check.
 *
 * Types not listed (company-enrich batches, test types) are not coalesced.
 * Migration 0051 backfills the same keys in SQL for pending rows;
 * tests/integration/queue-coalesce.test.ts keeps the two in step.
 */

export type CoalesceMode = 'merge' | 'replace'

type Payload = Readonly<Record<string, unknown>>

interface CoalesceRule {
  mode: CoalesceMode
  key: (userId: string | null, payload: Payload) => string | null
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)
const perUser = (userId: string | null): string | null => userId
const perUserAnd =
  (field: string) =>
  (userId: string | null, payload: Payload): string | null => {
    const v = str(payload[field])
    return userId && v ? `${userId}:${v}` : null
  }

const REPLACE_PER_USER: CoalesceRule = { mode: 'replace', key: perUser }

export const COALESCE_RULES: Readonly<Record<string, CoalesceRule>> = {
  [JOB_TYPES.discoverySource]: { mode: 'merge', key: perUserAnd('sourceId') },
  [JOB_TYPES.radarSource]: { mode: 'replace', key: perUserAnd('source') },
  [JOB_TYPES.radarNew]: { mode: 'replace', key: (_u, p) => str(p.source) },
  [JOB_TYPES.companyReputation]: { mode: 'replace', key: perUserAnd('companyId') },
  [JOB_TYPES.reminders]: { mode: 'replace', key: () => 'all' },
  [JOB_TYPES.usageSnapshot]: { mode: 'replace', key: () => 'all' },
  [JOB_TYPES.followups]: REPLACE_PER_USER,
  [JOB_TYPES.gmailSync]: REPLACE_PER_USER,
  [JOB_TYPES.digest]: REPLACE_PER_USER,
  [JOB_TYPES.discoveryEmail]: REPLACE_PER_USER,
  [JOB_TYPES.scamReassess]: REPLACE_PER_USER,
  [JOB_TYPES.shortlist]: REPLACE_PER_USER,
  [JOB_TYPES.discoveryRelevance]: REPLACE_PER_USER,
  [JOB_TYPES.discoveryMatch]: REPLACE_PER_USER,
  [JOB_TYPES.discoveryBenefits]: REPLACE_PER_USER,
  [JOB_TYPES.portfolioPull]: REPLACE_PER_USER,
  [JOB_TYPES.companyDiscovery]: REPLACE_PER_USER,
  [JOB_TYPES.companyGrowth]: REPLACE_PER_USER,
  [JOB_TYPES.companyBoards]: REPLACE_PER_USER,
}

export function coalesceMode(type: string): CoalesceMode | null {
  return COALESCE_RULES[type]?.mode ?? null
}

/** The job's coalesce key, or null when its type is not coalesced. */
export function coalesceKey(type: string, userId: string | null, payload: Payload = {}): string | null {
  return COALESCE_RULES[type]?.key(userId, payload) ?? null
}
