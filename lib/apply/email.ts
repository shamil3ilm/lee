import * as profileQ from '@/lib/db/queries/profile'
import { repairMojibake } from '@/lib/discovery/relevance/text'
import { logger } from '@/lib/logger'
import { readShortlist } from './shortlist'
import { applySettingsFrom } from './settings'

/** One shortlist line in the weekly digest or the discovery email. */
export interface EmailShortlistItem {
  title: string
  companyName: string
  score: number
  /** The strongest reason after the AI match, e.g. "Role: Backend". */
  why: string | null
}

const EMAIL_ITEMS = 5

/**
 * The open picks of the latest shortlist for an email, when the user keeps
 * "Include the shortlist in emails" on. Never throws: an email goes out
 * without the section rather than not at all.
 */
export async function shortlistForEmail(userId: string, now: Date = new Date()): Promise<EmailShortlistItem[]> {
  try {
    const profile = await profileQ.get(userId)
    if (!applySettingsFrom(profile).shortlistInEmails) return []
    const view = await readShortlist(userId, now)
    return view.entries
      .filter((e) => e.state === 'open')
      .slice(0, EMAIL_ITEMS)
      .map((e) => ({
        title: repairMojibake(e.title ?? 'Untitled'),
        companyName: repairMojibake(e.companyName ?? 'Unknown company'),
        score: e.score,
        why: e.reasons.find((r) => r.kind !== 'match' && r.points > 0)?.label ?? null,
      }))
  } catch (err) {
    logger.warn('email_shortlist_failed', { err: err instanceof Error ? err.message : String(err) })
    return []
  }
}
