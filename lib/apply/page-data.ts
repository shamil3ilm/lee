import * as profileQ from '@/lib/db/queries/profile'
import * as feedbackQ from '@/lib/db/queries/discoveryFeedback'
import { searchPrefsFromProfile } from '@/lib/discovery/relevance/prefs'
import { repairMojibake } from '@/lib/discovery/relevance/text'
import { toMatchDetail } from '@/lib/discovery/match/detail'
import type { MatchDetail } from '@/lib/discovery/match/types'
import type { ShortlistRow } from '@/lib/db/queries/shortlist'
import { prefSuggestions, type PrefSuggestion } from './feedback'
import { FEEDBACK_WINDOW_DAYS, readShortlist } from './shortlist'
import { applySettingsFrom } from './settings'
import { comparisonChips } from '@/lib/compare/service'
import { opportunityKey } from '@/lib/compare/inputs'
import { logger } from '@/lib/logger'

/**
 * What the shortlist page renders, from the precomputed snapshot (plus the
 * small feedback table for preference suggestions). No ranking at read time.
 */

export interface ShortlistEntryView {
  discoveryId: string
  rank: number
  score: number
  state: ShortlistRow['state']
  title: string
  companyName: string
  location: string | null
  applyUrl: string | null
  reasons: ShortlistRow['reasons']
  variantName: string | null
  applicationId: string | null
  /** "vs current: pay ↑ 35% est. · …" when a current job is saved. */
  vsCurrent: string | null
  /** AI score, deterministic Match Score and its explanation (the badge). */
  matchScore: number | null
  fitScore: number | null
  fitDetail: MatchDetail | null
}

export interface ShortlistPageData {
  day: string | null
  today: boolean
  size: number
  open: ShortlistEntryView[]
  acted: ShortlistEntryView[]
  suggestions: PrefSuggestion[]
}

function toView(r: ShortlistRow): ShortlistEntryView {
  return {
    discoveryId: r.discoveryId,
    rank: r.rank,
    score: r.score,
    state: r.state,
    title: repairMojibake(r.title ?? 'Untitled'),
    companyName: repairMojibake(r.companyName ?? 'Unknown company'),
    location: r.location ? repairMojibake(r.location) : null,
    applyUrl: r.applyUrl,
    reasons: r.reasons,
    variantName: r.variantName,
    applicationId: r.savedApplicationId,
    matchScore: r.matchScore,
    fitScore: r.fitScore,
    fitDetail: toMatchDetail(r.fitDetail),
    vsCurrent: null,
  }
}

/** Comparison chips for the open picks; a failure only drops the chips. */
async function withChips(userId: string, entries: ShortlistEntryView[], now: Date): Promise<ShortlistEntryView[]> {
  const open = entries.filter((e) => e.state === 'open')
  try {
    const chips = await comparisonChips(userId, open.map((e) => opportunityKey('discovery', e.discoveryId)), now)
    if (chips.size === 0) return entries
    return entries.map((e) => ({ ...e, vsCurrent: chips.get(opportunityKey('discovery', e.discoveryId)) ?? null }))
  } catch (err) {
    logger.warn('compare_chips_failed', { err: err instanceof Error ? err.name : 'unknown' })
    return entries
  }
}

export async function loadShortlistPage(userId: string, now: Date = new Date()): Promise<ShortlistPageData> {
  const since = new Date(now.getTime() - FEEDBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const [view, profile, feedback] = await Promise.all([
    readShortlist(userId, now),
    profileQ.get(userId),
    feedbackQ.listSince(userId, since),
  ])
  const entries = await withChips(userId, view.entries.map(toView), now)
  return {
    day: view.day,
    today: view.today,
    size: applySettingsFrom(profile).shortlistSize,
    open: entries.filter((e) => e.state === 'open'),
    acted: entries.filter((e) => e.state !== 'open'),
    suggestions: prefSuggestions(feedback, searchPrefsFromProfile(profile).roleFamilies),
  }
}
