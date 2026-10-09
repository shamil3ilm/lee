import * as messagesQ from '@/lib/db/queries/linkedinPostMessages'
import * as capturesQ from '@/lib/db/queries/postCaptures'
import { appOrigin } from '@/lib/integrations/config'
import { readSourceLastResult } from '@/lib/discovery/poll-stats'
import { bookmarkletHref } from './bookmarklet'
import { captureKey } from './capture'
import { findLinkedInPostSource } from './source'

/**
 * SERVER-ONLY. Settings › LinkedIn › Hiring posts: the source's state, the
 * latest sync's counts, parser health (LinkedIn's email formats change; a
 * run of unreadable emails means the parser needs an update) and the
 * user's bookmarklet. Counts only, never email content.
 */

export type ParserHealth = 'off' | 'waiting' | 'ok' | 'degraded'

export interface HiringPostsPanelData {
  enabled: boolean
  lastError: string | null
  lastPolledAt: string | null
  lastRun: { fetched: number; new: number; parseFailures: number } | null
  totals: { emails: number; posts: number; hiring: number; failed: number; lastEmailAt: string | null }
  recent: Array<{ kind: string; receivedAt: string; postsFound: number; hiringFound: number; parseFailed: boolean }>
  health: ParserHealth
  bookmarklet: string
}

export function parserHealth(enabled: boolean, recent: ReadonlyArray<{ parseFailed: boolean }>): ParserHealth {
  if (!enabled) return 'off'
  if (recent.length === 0) return 'waiting'
  const failed = recent.filter((r) => r.parseFailed).length
  return failed * 2 >= recent.length && failed >= 2 ? 'degraded' : 'ok'
}

export async function hiringPostsPanelData(userId: string): Promise<HiringPostsPanelData> {
  const [source, totals, recent, version] = await Promise.all([
    findLinkedInPostSource(userId),
    messagesQ.summary(userId),
    messagesQ.recent(userId, 5),
    capturesQ.keyVersion(userId),
  ])
  const last = source ? readSourceLastResult(source.lastResult) : null
  const enabled = source?.enabled ?? false
  return {
    enabled,
    lastError: source?.lastError ?? null,
    lastPolledAt: source?.lastPolledAt?.toISOString() ?? null,
    lastRun: last ? { fetched: last.fetched, new: last.new, parseFailures: last.parseFailures ?? 0 } : null,
    totals: { emails: totals.emails, posts: totals.posts, hiring: totals.hiring, failed: totals.failed, lastEmailAt: totals.lastEmailAt?.toISOString() ?? null },
    recent: recent.map((r) => ({ kind: r.kind, receivedAt: r.receivedAt.toISOString(), postsFound: r.postsFound, hiringFound: r.hiringFound, parseFailed: r.parseFailed })),
    health: parserHealth(enabled, recent),
    bookmarklet: bookmarkletHref(appOrigin(), captureKey(userId, version)),
  }
}
