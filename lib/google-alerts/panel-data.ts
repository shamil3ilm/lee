import type { UserProfile } from '@/lib/db/queries/profile'
import type { Source } from '@/lib/db/queries/sources'
import { GCC_CODES } from '@/lib/discovery/relevance/places'
import { searchPrefsFromProfile } from '@/lib/discovery/relevance/prefs'
import { suggestAlertQueries } from './queries'
import { getPlaybook } from '@/lib/coverage/playbooks'
import { countryOf } from '@/lib/regions/tree'

/** Starred regions as ISO-2 country codes, top priority first. */
function starredCountries(starred: readonly { id: string; level: string }[]): string[] {
  const sorted = [...starred].sort((a, b) => (a.level === 'top' ? 0 : 1) - (b.level === 'top' ? 0 : 1))
  return [...new Set(sorted.map((r) => countryOf(r.id)?.toUpperCase()).filter((c): c is string => Boolean(c)))]
}

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
    starred: starredCountries(prefs.extra.preferredRegions ?? []),
    localQueries: (prefs.extra.preferredRegions ?? []).flatMap((r) => getPlaybook(r.id)?.localQueries ?? []),
  })
  const s = sources.find((x) => x.kind === 'google_alerts')
  const rss = (s?.config as { rssUrl?: unknown } | null)?.rssUrl
  return {
    queries,
    source: s ? { enabled: s.enabled, rssUrl: typeof rss === 'string' ? rss : null, lastError: s.lastError } : null,
  }
}
