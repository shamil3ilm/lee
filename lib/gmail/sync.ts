import * as actQ from '@/lib/db/queries/activities'
import * as profileQ from '@/lib/db/queries/profile'
import * as processedQ from '@/lib/db/queries/processedGmailThreads'
import { getGoogleTokens } from '@/lib/google/tokens'
import { logger } from '@/lib/logger'
import {
  extractEmailAddress,
  extractHeader,
  getThread,
  listThreads,
  type GmailThreadFull,
  type GmailThreadSummary,
} from './adapter'
import { matchThreadToApplication } from './matcher'
import { mapWithConcurrency } from '@/lib/util/concurrency'

/** Gmail thread fetches in flight at once (well inside Gmail's per-user quota). */
export const GMAIL_THREAD_CONCURRENCY = 5

type ThreadOutcome = 'matched' | 'unmatched' | 'failed'

/**
 * Fetch, match and record one thread. Failures are logged and reported as
 * 'failed' — one bad thread must not abort the rest of the sync.
 */
async function processThread(args: {
  userId: string
  summary: GmailThreadSummary
  tokens: Awaited<ReturnType<typeof getGoogleTokens>>
  getThreadFn: typeof getThread
}): Promise<ThreadOutcome> {
  const { userId, summary, tokens, getThreadFn } = args
  try {
    const full: GmailThreadFull = await getThreadFn({ tokens, threadId: summary.id })
    const match = await matchThreadToApplication({ thread: full, userId })
    if (!match) {
      await processedQ.markProcessed(userId, summary.id, null)
      return 'unmatched'
    }
    const firstMsg = full.messages[0]
    const from = firstMsg ? extractEmailAddress(extractHeader(firstMsg, 'From')) : undefined
    const subject = firstMsg ? extractHeader(firstMsg, 'Subject') : undefined
    await actQ.log(userId, match.applicationId, 'email', {
      threadId: summary.id,
      from: from ?? null,
      subject: subject ?? null,
      snippet: firstMsg?.snippet ?? summary.snippet ?? '',
      matchReason: match.reason,
    })
    await processedQ.markProcessed(userId, summary.id, match.applicationId)
    return 'matched'
  } catch (err) {
    logger.warn('gmail_sync_thread_failed', {
      userId,
      threadId: summary.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return 'failed'
  }
}

export interface SyncResult {
  checked: number
  matched: number
  logged: number
}

/**
 * DI seams for tests — production callers should NOT pass adapters. The
 * defaults resolve to the real Gmail REST wrappers.
 */
export interface SyncGmailArgs {
  userId: string
  adapters?: {
    listThreads?: typeof listThreads
    getThread?: typeof getThread
  }
}

/**
 * One pass of Gmail sync for `userId`:
 *   1. Refresh Google tokens (throws NoGoogleAccountError if user hasn't
 *      connected — callers may skip silently).
 *   2. List up to 100 threads from the last 30 days.
 *   3. For each thread not already recorded in processed_gmail_threads:
 *      - Fetch metadata
 *      - Run the deterministic matcher
 *      - If matched, log an `activity` row of kind='email' on the app
 *      - Mark the thread processed regardless (dedup)
 *   4. Bump user_profile.syncedGmailAt to now().
 *
 * Per-thread failures are logged and counted but do NOT abort the sync — one
 * bad thread should not lock the user out of the rest of their inbox.
 */
export async function syncGmail(args: SyncGmailArgs): Promise<SyncResult> {
  const { userId } = args
  const listThreadsFn = args.adapters?.listThreads ?? listThreads
  const getThreadFn = args.adapters?.getThread ?? getThread

  const tokens = await getGoogleTokens(userId)
  const summaries: GmailThreadSummary[] = await listThreadsFn({ tokens })

  // One query for the whole page instead of one `has()` per thread.
  const processed = await processedQ.processedThreadIds(
    userId,
    summaries.map((s) => s.id),
  )
  const fresh = summaries.filter((s) => !processed.has(s.id))

  const outcomes = await mapWithConcurrency(fresh, GMAIL_THREAD_CONCURRENCY, (summary) =>
    processThread({ userId, summary, tokens, getThreadFn }),
  )
  const matched = outcomes.filter((o) => o === 'matched').length
  const result: SyncResult = { checked: summaries.length, matched, logged: matched }

  await profileQ.upsert(userId, { syncedGmailAt: new Date() })
  logger.info('gmail_sync_done', { userId, ...result })
  return result
}
