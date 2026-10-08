import type { UserProfile } from '@/lib/db/queries/profile'
import type { Source } from '@/lib/db/queries/sources'
import { GCC_CODES } from '@/lib/discovery/relevance/places'
import { searchPrefsFromProfile } from '@/lib/discovery/relevance/prefs'
import { suggestAlertQueries } from './queries'

/** What the Google Alerts panel shows: suggested queries and the source's state. */
export function googleAlertsPanelData(
  profile: UserProfile | null,
  sources: readonly Source[],
): { queries: string[]; source: { enabled: boolean; rssUrl: string | null; lastError: string | null } | null } {
  const prefs = searchPrefsFromProfile(profile)
  // Watched employers (watch links and enterprise careers sites) give the site: queries.
  const careersHosts = [
    ...new Set(
      sources
        .filter((s) => s.enabled)
        .map((s) => (s.config as { url?: unknown } | null)?.url)
        .filter((u): u is string => typeof u === 'string')
        .map((u) => {
          try {
            return new URL(u).hostname.replace(/^www\./, '')
          } catch {
            return ''
          }
        })
        .filter(Boolean),
    ),
  ]
  const queries = suggestAlertQueries({
    roleFamilies: prefs.roleFamilies.length > 0 ? prefs.roleFamilies : prefs.provisionalFamilies,
    customRoles: prefs.customRoles,
    regions: prefs.regions,
    strengths: prefs.strengths,
    careersHosts,
    needsVisa: prefs.extra.sponsorshipFor.some((c) => (GCC_CODES as readonly string[]).includes(c)),
  })
  const s = sources.find((x) => x.kind === 'google_alerts')
  const rss = (s?.config as { rssUrl?: unknown } | null)?.rssUrl
  return {
    queries,
    source: s ? { enabled: s.enabled, rssUrl: typeof rss === 'string' ? rss : null, lastError: s.lastError } : null,
  }
}
