import * as profileQ from '@/lib/db/queries/profile'
import * as feedbackQ from '@/lib/db/queries/discoveryFeedback'
import { searchPrefsFromProfile } from '@/lib/discovery/relevance/prefs'
import { repairMojibake } from '@/lib/discovery/relevance/text'
import type { ShortlistRow } from '@/lib/db/queries/shortlist'
import { prefSuggestions, type PrefSuggestion } from './feedback'
import { FEEDBACK_WINDOW_DAYS, readShortlist } from './shortlist'
import { applySettingsFrom } from './settings'

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
  }
}

export async function loadShortlistPage(userId: string, now: Date = new Date()): Promise<ShortlistPageData> {
  const since = new Date(now.getTime() - FEEDBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const [view, profile, feedback] = await Promise.all([
    readShortlist(userId, now),
    profileQ.get(userId),
    feedbackQ.listSince(userId, since),
  ])
  const entries = view.entries.map(toView)
  return {
    day: view.day,
    today: view.today,
    size: applySettingsFrom(profile).shortlistSize,
    open: entries.filter((e) => e.state === 'open'),
    acted: entries.filter((e) => e.state !== 'open'),
    suggestions: prefSuggestions(feedback, searchPrefsFromProfile(profile).roleFamilies),
  }
}
