import * as profileQ from '@/lib/db/queries/profile'
import { logger } from '@/lib/logger'
import { radarNotifyMode } from '../digest'
import { selectWhatsNewDigest, whatsNewInDigest, type NewDigestSection } from './digest'
import { rankedSince } from './view'

/**
 * The weekly digest's "What's new" section for one user: the week's top
 * few per category by their own ranking, unless their radar mode is off.
 * Never throws — the digest goes out without the section instead.
 */

const WEEK_MS = 7 * 86_400_000

export async function whatsNewSectionsFor(userId: string, opts: { now?: Date } = {}): Promise<NewDigestSection[]> {
  try {
    const now = opts.now ?? new Date()
    const profile = await profileQ.get(userId)
    if (!whatsNewInDigest(radarNotifyMode(profile?.radarNotify))) return []
    const since = new Date(now.getTime() - WEEK_MS)
    return selectWhatsNewDigest(await rankedSince(userId, since, now), { since })
  } catch (err) {
    logger.warn('radar_new_digest_failed', { err: err instanceof Error ? err.message : String(err) })
    return []
  }
}
