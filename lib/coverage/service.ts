import * as sourcesQ from '@/lib/db/queries/sources'
import * as emailAlertsQ from '@/lib/db/queries/emailAlerts'
import { regionActivity } from '@/lib/db/queries/coverage'
import { getProfile } from '@/lib/profile/service'
import { searchPrefsFromProfile, type SearchPrefs } from '@/lib/discovery/relevance/prefs'
import { ROLE_PHRASES } from '@/lib/google-alerts/queries'
import { normalizePreferred, type PreferredLevel } from '@/lib/regions/preferred'
import { regionCoverage, type RegionCoverage } from './compute'
import { playbooksForUser } from './for-user'

/**
 * The coverage rows for one user: every region their preferences touch,
 * starred first, each with its status, source counts, last week's
 * activity and next steps. Read-only.
 */

export interface UserCoverage extends RegionCoverage {
  starred: PreferredLevel | null
}

/** The role phrase alert presets search for ("Laravel developer", "data analyst"). */
export function presetQuery(prefs: Pick<SearchPrefs, 'roleFamilies' | 'provisionalFamilies' | 'strengths'>): string {
  if (prefs.strengths.includes('laravel')) return 'Laravel developer'
  const family = [...prefs.roleFamilies, ...prefs.provisionalFamilies].find((f) => ROLE_PHRASES[f])
  return family ? ROLE_PHRASES[family]! : 'software developer'
}

export async function userCoverage(userId: string, now: Date = new Date()): Promise<UserCoverage[]> {
  const [profile, sources, alertStats] = await Promise.all([getProfile(userId), sourcesQ.list(userId), emailAlertsQ.summaryBySite(userId)])
  const prefs = searchPrefsFromProfile(profile)
  const regions = playbooksForUser({
    regionIds: prefs.regionIds,
    otherCountries: prefs.otherCountries,
    remoteScope: prefs.remoteScope,
    preferred: normalizePreferred(prefs.extra.preferredRegions ?? []),
  })
  if (regions.length === 0) return []
  const activity = await regionActivity(
    userId,
    regions.map((r) => r.playbook.covers[0]!),
    7,
    now,
  )
  const rows = sources.map((s) => ({ id: s.id, kind: s.kind, enabled: s.enabled, config: (s.config ?? {}) as Record<string, unknown> }))
  const alertSitesSeen = new Set(alertStats.filter((a) => a.alerts > 0).map((a) => a.site))
  const query = presetQuery(prefs)
  return regions.map(({ playbook, starred }) => ({
    ...regionCoverage({
      playbook,
      sources: rows,
      activity: activity.get(playbook.covers[0]!) ?? { byStatus: {}, companies: 0, yieldingSources: 0 },
      query,
      alertSitesSeen,
    }),
    starred,
  }))
}
