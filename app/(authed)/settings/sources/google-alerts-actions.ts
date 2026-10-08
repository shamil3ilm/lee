'use server'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import * as sourcesQ from '@/lib/db/queries/sources'
import { googleAlertsConfigSchema } from '@/lib/discovery/adapters/google-alerts'
import { logger } from '@/lib/logger'

export type GoogleAlertsResult = { success: true } | { error: string }

/**
 * Turn on the Google Alerts source (email delivery always; the RSS feed
 * when the user pastes its URL). One source per user; saving again updates
 * the feed URL.
 */
export async function saveGoogleAlertsAction(rssUrl: string): Promise<GoogleAlertsResult> {
  const trimmed = rssUrl.trim()
  const parsed = googleAlertsConfigSchema.safeParse({ email: true, rssUrl: trimmed === '' ? null : trimmed })
  if (!parsed.success) return { error: 'Paste the alert’s RSS link (https://www.google.com/alerts/feeds/…).' }
  try {
    const userId = await requireUserId()
    const existing = (await sourcesQ.list(userId)).find((s) => s.kind === 'google_alerts')
    if (existing) await sourcesQ.update(userId, existing.id, { config: parsed.data, enabled: true })
    else await sourcesQ.create(userId, { name: 'Google Alerts', kind: 'google_alerts', config: parsed.data, enabled: true })
    revalidatePath('/settings/sources')
    return { success: true }
  } catch (err) {
    logger.error('saveGoogleAlerts failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not save the Google Alerts source.' }
  }
}
