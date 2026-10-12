import { after } from 'next/server'
import { logger } from '@/lib/logger'
import { drain } from './drain'
import { JOB_TYPES, jobKeys } from './job-types'
import { enqueueSourcePolls } from './scheduler'

/** Wall-clock budget for the first poll run after a source is added. */
const FIRST_POLL_BUDGET_MS = 45_000

/**
 * A bulk "Turn on" / "Check now" runs at most this many polls right after
 * the response; the rest wait in the queue for the next drain (cron, visit),
 * which takes never-polled and then the stalest sources first and slices
 * time per user (lib/queue/queue.ts claim, lib/queue/capacity.ts). A mass
 * enable of 100 sources never runs 100 polls inline.
 */
export const BULK_INLINE_POLLS = 3

/**
 * After the response, drain exactly `jobIds` (never the user's oldest
 * queued poll). Uses Next's `after()` directly (not runAfterResponse):
 * outside a request — tests, scripts — the jobs are only queued and run on
 * the next drain, so no job-board network calls happen inline.
 */
function drainAfterResponse(userId: string, jobIds: readonly string[], context: Record<string, unknown>): void {
  if (jobIds.length === 0) return
  try {
    after(async () => {
      try {
        await drain({
          userId,
          types: [JOB_TYPES.discoverySource],
          jobIds,
          budgetMs: FIRST_POLL_BUDGET_MS,
          maxJobs: jobIds.length,
          concurrency: Math.min(jobIds.length, BULK_INLINE_POLLS),
        })
      } catch (err) {
        logger.warn('first_poll_drain_failed', {
          userId,
          ...context,
          err: err instanceof Error ? err.message : String(err),
        })
      }
    })
  } catch {
    // No request scope: the queued jobs run on the next drain.
  }
}

/**
 * Queue a poll of a just-added (or re-enabled) source and, inside a request,
 * run THAT poll right after the response (the drain targets its job id, not
 * the user's oldest poll), so the first discoveries appear within a minute
 * instead of at the next daily scheduler run. When the source already has a
 * pending poll (e.g. queued days ago behind a backlog), that one is pulled
 * forward and run instead of queuing another.
 *
 * Returns true when a new poll job was inserted.
 */
export async function queueFirstPoll(userId: string, sourceId: string, now: Date = new Date()): Promise<boolean> {
  const { created, jobIds } = await enqueueSourcePolls(userId, [sourceId], now)
  if (jobIds.length === 0) return false
  logger.info('source_first_poll_queued', { userId, sourceId })
  drainAfterResponse(userId, jobIds, { sourceId })
  return created > 0
}

export interface PollCandidate {
  id: string
  lastPolledAt: Date | null
}

/** Never-polled first, then the stalest, then id: the drain's claim order. */
export function stalestFirst<T extends PollCandidate>(sources: readonly T[]): T[] {
  return [...sources].sort((a, b) => {
    if (a.lastPolledAt === null || b.lastPolledAt === null) {
      if (a.lastPolledAt !== b.lastPolledAt) return a.lastPolledAt === null ? -1 : 1
    } else if (a.lastPolledAt.getTime() !== b.lastPolledAt.getTime()) {
      return a.lastPolledAt.getTime() - b.lastPolledAt.getTime()
    }
    return a.id.localeCompare(b.id)
  })
}

export interface FirstPollsQueued {
  /** Poll jobs inserted (the rest were folded into a pending poll: one per source). */
  created: number
  /** Sources with a pending poll after this call. */
  queued: number
  /** Polls run right after the response (at most BULK_INLINE_POLLS). */
  inline: number
}

/**
 * Bulk version of queueFirstPoll: one pending poll per source (coalesced,
 * lib/queue/coalesce.ts), all due now, and only the first
 * BULK_INLINE_POLLS — never-polled, then the stalest — run right after the
 * response. Two enqueue statements: the inline few (to learn their job ids),
 * then the rest.
 */
export async function queueFirstPolls(
  userId: string,
  sources: readonly PollCandidate[],
  now: Date = new Date(),
  opts: { inlineMax?: number; manual?: boolean } = {},
): Promise<FirstPollsQueued> {
  if (sources.length === 0) return { created: 0, queued: 0, inline: 0 }
  const inlineMax = opts.inlineMax ?? BULK_INLINE_POLLS
  // "Check now" may re-poll a source already polled today: its own hourly key.
  const hour = now.toISOString().slice(0, 13)
  const key = opts.manual ? (sourceId: string) => jobKeys.discoverySourceManual(userId, sourceId, hour) : undefined
  const ranked = stalestFirst(sources).map((s) => s.id)
  const head = await enqueueSourcePolls(userId, ranked.slice(0, inlineMax), now, key)
  const rest = ranked.length > inlineMax ? await enqueueSourcePolls(userId, ranked.slice(inlineMax), now, key) : { created: 0, jobIds: [] }
  const result = { created: head.created + rest.created, queued: head.jobIds.length + rest.jobIds.length, inline: head.jobIds.length }
  logger.info('source_first_polls_queued', { userId, ...result })
  drainAfterResponse(userId, head.jobIds, { sources: sources.length })
  return result
}
