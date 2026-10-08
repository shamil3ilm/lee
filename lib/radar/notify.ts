import * as profileQ from '@/lib/db/queries/profile'
import * as feedQ from '@/lib/db/queries/radarFeed'
import * as termsQ from '@/lib/db/queries/radarTerms'
import { logger } from '@/lib/logger'
import { channelFor, radarNotifyMode, selectDigestEntries, type RadarChannel, type DigestLine } from './digest'

/**
 * Server side of the regular updates: the radar lines for one channel,
 * honouring the user's mode (Settings › Notifications). Never throws: an
 * email goes out without the section rather than not at all.
 */

const WEEK_MS = 7 * 86_400_000
const DAY_MS = 86_400_000

export async function radarLinesFor(
  userId: string,
  channel: RadarChannel,
  opts: { since?: Date; now?: Date } = {},
): Promise<DigestLine[]> {
  try {
    const now = opts.now ?? new Date()
    const profile = await profileQ.get(userId)
    if (channelFor(radarNotifyMode(profile?.radarNotify)) !== channel) return []
    const fallback = channel === 'weekly_digest' ? WEEK_MS : DAY_MS
    const since = opts.since ?? new Date(now.getTime() - fallback)
    const [candidates, terms] = await Promise.all([feedQ.watchedSince(userId, since), termsQ.list(userId)])
    const termLabels = new Map(terms.filter((t) => !t.muted).map((t) => [t.id, t.term]))
    return selectDigestEntries(candidates, { since, termLabels })
  } catch (err) {
    logger.warn('radar_digest_failed', { err: err instanceof Error ? err.message : String(err) })
    return []
  }
}
