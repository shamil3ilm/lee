import * as sourcesQ from '@/lib/db/queries/sources'
import * as emailAlertsQ from '@/lib/db/queries/emailAlerts'
import { regionActivity } from '@/lib/db/queries/coverage'
import { getProfile } from '@/lib/profile/service'
import { searchPrefsFromProfile, type SearchPrefs } from '@/lib/discovery/relevance/prefs'
import { ROLE_PHRASES } from '@/lib/google-alerts/queries'
import { normalizePreferred, type PreferredLevel } from '@/lib/regions/preferred'
import { regionCoverage, type CoverageSourceRow, type RegionCoverage } from './compute'
import { playbooksForUser } from './for-user'
import { suggestedBoardCounts } from '@/lib/company-discovery/boards'
import { lineRegionIds, linePlaybook, rollUp } from './line'
import type { RegionPlaybook } from './playbook-types'

/**
 * The coverage rows for one user: every region their preferences touch,
 * starred first, each with its status, source counts, last week's
 * activity and next steps. Read-only.
 */

export interface UserCoverage extends RegionCoverage {
  starred: PreferredLevel | null
  /** Employer boards the weekly auto-detect found in the region that lee does not read yet. */
  employerBoards: number
}

/** The role phrase alert presets search for ("Laravel developer", "data analyst"). */
export function presetQuery(prefs: Pick<SearchPrefs, 'roleFamilies' | 'provisionalFamilies' | 'strengths'>): string {
  if (prefs.strengths.includes('laravel')) return 'Laravel developer'
  const family = [...prefs.roleFamilies, ...prefs.provisionalFamilies].find((f) => ROLE_PHRASES[f])
  return family ? ROLE_PHRASES[family]! : 'software developer'
}

interface CoverageContext {
  prefs: SearchPrefs
  rows: CoverageSourceRow[]
  alertSitesSeen: ReadonlySet<string>
  query: string
}

async function loadContext(userId: string): Promise<CoverageContext> {
  const [profile, sources, alertStats] = await Promise.all([getProfile(userId), sourcesQ.list(userId), emailAlertsQ.summaryBySite(userId)])
  const prefs = searchPrefsFromProfile(profile)
  return {
    prefs,
    rows: sources.map((s) => ({ id: s.id, kind: s.kind, enabled: s.enabled, config: (s.config ?? {}) as Record<string, unknown> })),
    alertSitesSeen: new Set(alertStats.filter((a) => a.alerts > 0).map((a) => a.site)),
    query: presetQuery(prefs),
  }
}

async function measure(
  userId: string,
  ctx: CoverageContext,
  regions: readonly { playbook: RegionPlaybook; starred: PreferredLevel | null }[],
  now: Date,
): Promise<UserCoverage[]> {
  if (regions.length === 0) return []
  const activity = await regionActivity(
    userId,
    regions.map((r) => r.playbook.covers[0]!),
    7,
    now,
  )
  const boards = await suggestedBoardCounts(
    userId,
    regions.map((r) => r.playbook.covers[0]!),
  ).catch(() => new Map<string, { count: number }>())
  return regions.map(({ playbook, starred }) => ({
    ...regionCoverage({
      playbook,
      sources: ctx.rows,
      activity: activity.get(playbook.covers[0]!) ?? { byStatus: {}, companies: 0, yieldingSources: 0 },
      query: ctx.query,
      alertSitesSeen: ctx.alertSitesSeen,
    }),
    starred,
    employerBoards: boards.get(playbook.covers[0]!)?.count ?? 0,
  }))
}

export async function userCoverage(userId: string, now: Date = new Date()): Promise<UserCoverage[]> {
  const ctx = await loadContext(userId)
  const regions = playbooksForUser({
    regionIds: ctx.prefs.regionIds,
    otherCountries: ctx.prefs.otherCountries,
    remoteScope: ctx.prefs.remoteScope,
    preferred: normalizePreferred(ctx.prefs.extra.preferredRegions ?? []),
  })
  return measure(userId, ctx, regions, now)
}

/**
 * Discovery's one-line summary: the starred regions only, cities rolled up
 * to their state or country (lib/coverage/line.ts). Empty without stars.
 */
export async function starredCoverage(userId: string, now: Date = new Date()): Promise<UserCoverage[]> {
  const ctx = await loadContext(userId)
  const regions = lineRegionIds(ctx.prefs.extra.preferredRegions ?? []).map((r) => ({ playbook: linePlaybook(r.id), starred: r.level }))
  return measure(userId, ctx, regions, now)
}

/**
 * The line while a region filter is on: coverage for the filtered regions
 * (rolled up like the starred ones), so "Kuwait" shows Kuwait's sources and
 * jobs, not the starred list. Starred levels are kept where they match.
 */
export async function filterCoverage(userId: string, regionIds: readonly string[], now: Date = new Date()): Promise<UserCoverage[]> {
  if (regionIds.length === 0) return starredCoverage(userId, now)
  const ctx = await loadContext(userId)
  const stars = new Map(lineRegionIds(ctx.prefs.extra.preferredRegions ?? [], 8).map((r) => [r.id, r.level] as const))
  const ids = [...new Set(regionIds.map(rollUp))].slice(0, 3)
  return measure(userId, ctx, ids.map((id) => ({ playbook: linePlaybook(id), starred: stars.get(id) ?? null })), now)
}
