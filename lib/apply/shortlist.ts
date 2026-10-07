import * as profileQ from '@/lib/db/queries/profile'
import * as shortlistQ from '@/lib/db/queries/shortlist'
import * as feedbackQ from '@/lib/db/queries/discoveryFeedback'
import { searchPrefsFromProfile } from '@/lib/discovery/relevance/prefs'
import { variantSummaries } from '@/lib/variants/service'
import { signalsFromTags, suggestVariant, type VariantSummary } from '@/lib/variants/suggest'
import { getUserTimeZone } from '@/lib/settings/timezone'
import { logger } from '@/lib/logger'
import { loadCandidates, targetRegionTags, type Candidate } from './candidates'
import { buildShortlist } from './rank'
import { localDay } from './dates'
import { applySettingsFrom } from './settings'

/**
 * The daily shortlist: rank the user's new and recent discoveries with the
 * composite (lib/apply/rank.ts) and store the top N for their local day.
 * Runs as the `shortlist:user` queue job after the source polls and the
 * Scam Shield re-check, and on "Refresh". DB-only (no AI), idempotent.
 */

/** Feedback older than this no longer lowers postings. */
export const FEEDBACK_WINDOW_DAYS = 180

export interface BuildResult {
  day: string
  candidates: number
  shortlisted: number
}

function variantFor(variants: readonly VariantSummary[], c: Candidate): string | null {
  if (variants.length === 0) return null
  return suggestVariant(variants, signalsFromTags(c.regions, c.families)).variant?.id ?? null
}

export async function buildShortlistForUser(userId: string, now: Date = new Date()): Promise<BuildResult> {
  const [profile, tz] = await Promise.all([profileQ.get(userId), getUserTimeZone(userId)])
  const day = localDay(now, tz)
  const settings = applySettingsFrom(profile)
  const prefs = searchPrefsFromProfile(profile)
  const feedbackSince = new Date(now.getTime() - FEEDBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const [feedback, acted, variants] = await Promise.all([
    feedbackQ.listSince(userId, feedbackSince),
    shortlistQ.actedIds(userId, day),
    variantSummaries(userId),
  ])
  const candidates = await loadCandidates(userId, { now, feedback, excludeIds: acted })
  const ranked = buildShortlist(
    candidates,
    { now, targetFamilies: prefs.roleFamilies, targetRegions: targetRegionTags(prefs) },
    settings.shortlistSize,
  )
  const byId = new Map(candidates.map((c) => [c.id, c] as const))
  const written = await shortlistQ.replaceOpen(
    userId,
    day,
    ranked.map((r) => ({
      discoveryId: r.id,
      rank: r.rank,
      score: r.score,
      reasons: r.reasons.slice(0, 10),
      variantId: variantFor(variants, byId.get(r.id)!),
    })),
  )
  logger.info('shortlist_built', { userId, candidates: candidates.length, shortlisted: written, size: settings.shortlistSize })
  return { day, candidates: candidates.length, shortlisted: written }
}

export interface ShortlistView {
  day: string | null
  /** True when `day` is the user's today. */
  today: boolean
  entries: shortlistQ.ShortlistRow[]
}

/** The latest snapshot (today's once built). Reads the small precomputed table only. */
export async function readShortlist(userId: string, now: Date = new Date()): Promise<ShortlistView> {
  const [day, tz] = await Promise.all([shortlistQ.latestDay(userId), getUserTimeZone(userId)])
  if (!day) return { day: null, today: false, entries: [] }
  const entries = await shortlistQ.listForDay(userId, day)
  return { day, today: day === localDay(now, tz), entries }
}
