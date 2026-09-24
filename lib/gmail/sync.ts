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

  const result: SyncResult = { checked: 0, matched: 0, logged: 0 }

  for (const summary of summaries) {
    result.checked += 1
    try {
      if (await processedQ.has(userId, summary.id)) continue

      const full: GmailThreadFull = await getThreadFn({ tokens, threadId: summary.id })
      const match = await matchThreadToApplication({ thread: full, userId })

      if (match) {
        result.matched += 1
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
        result.logged += 1
        await processedQ.markProcessed(userId, summary.id, match.applicationId)
      } else {
        await processedQ.markProcessed(userId, summary.id, null)
      }
    } catch (err) {
      logger.warn('gmail_sync_thread_failed', {
        userId,
        threadId: summary.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  await profileQ.upsert(userId, { syncedGmailAt: new Date() })
  logger.info('gmail_sync_done', { userId, ...result })
  return result
}
