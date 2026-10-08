import { and, asc, countDistinct, eq, gte, inArray, max, ne, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { discoveries, resumeVariants, shortlistEntries } from '@/lib/db/schema'
import type { RankReason } from '@/lib/apply/rank'

export type ShortlistState = 'open' | 'later' | 'dismissed' | 'preparing'
export const SHORTLIST_STATES: readonly ShortlistState[] = ['open', 'later', 'dismissed', 'preparing']

export interface EntryWrite {
  discoveryId: string
  rank: number
  score: number
  reasons: RankReason[]
  variantId: string | null
}

/**
 * Replace the day's OPEN entries with `entries` in one transaction. Entries
 * the user already acted on (later / dismissed / preparing) stay as they
 * are, so a rebuild — a retry, a second drain, "Refresh" — never undoes a
 * choice and never duplicates a row (unique on user, day, discovery).
 */
export async function replaceOpen(
  userId: string,
  day: string,
  entries: readonly EntryWrite[],
  client: DbClient = db,
): Promise<number> {
  return client.transaction(async (tx) => {
    await tx
      .delete(shortlistEntries)
      .where(and(eq(shortlistEntries.userId, userId), eq(shortlistEntries.day, day), eq(shortlistEntries.state, 'open')))
    if (entries.length === 0) return 0
    const rows = await tx
      .insert(shortlistEntries)
      .values(entries.map((e) => ({ userId, day, ...e, reasons: e.reasons as never })))
      .onConflictDoNothing({ target: [shortlistEntries.userId, shortlistEntries.day, shortlistEntries.discoveryId] })
      .returning()
    return rows.length
  })
}

/** Discovery ids the user acted on in this day's shortlist. */
export async function actedIds(userId: string, day: string, client: DbClient = db): Promise<Set<string>> {
  const rows = await client
    .select({ id: shortlistEntries.discoveryId })
    .from(shortlistEntries)
    .where(and(eq(shortlistEntries.userId, userId), eq(shortlistEntries.day, day), ne(shortlistEntries.state, 'open')))
  return new Set(rows.map((r) => r.id))
}

export async function latestDay(userId: string, client: DbClient = db): Promise<string | null> {
  const [row] = await client
    .select({ day: max(shortlistEntries.day) })
    .from(shortlistEntries)
    .where(eq(shortlistEntries.userId, userId))
  return row?.day ?? null
}

export interface ShortlistRow {
  id: string
  discoveryId: string
  rank: number
  score: number
  reasons: RankReason[]
  state: ShortlistState
  variantId: string | null
  variantName: string | null
  title: string | null
  companyName: string | null
  location: string | null
  applyUrl: string | null
  matchScore: number | null
  fitScore: number | null
  fitDetail: unknown
  savedApplicationId: string | null
  /** Best CV for this posting (lib/cv-fit) and its key. */
  bestCv: unknown
  bestCvKey: string | null
}

const n = (key: string) => sql<string | null>`${discoveries.normalized}->>${key}`

/** The day's entries with what a card renders (no description, no raw payload). */
export async function listForDay(userId: string, day: string, client: DbClient = db): Promise<ShortlistRow[]> {
  const rows = await client
    .select({
      id: shortlistEntries.id,
      discoveryId: shortlistEntries.discoveryId,
      rank: shortlistEntries.rank,
      score: shortlistEntries.score,
      reasons: shortlistEntries.reasons,
      state: shortlistEntries.state,
      variantId: shortlistEntries.variantId,
      variantName: resumeVariants.name,
      title: n('title'),
      companyName: n('companyName'),
      location: n('location'),
      applyUrl: n('applyUrl'),
      matchScore: discoveries.matchScore,
      fitScore: discoveries.fitScore,
      fitDetail: discoveries.fitDetail,
      savedApplicationId: discoveries.savedApplicationId,
      bestCv: discoveries.bestCv,
      bestCvKey: discoveries.bestCvKey,
    })
    .from(shortlistEntries)
    .innerJoin(discoveries, eq(discoveries.id, shortlistEntries.discoveryId))
    .leftJoin(resumeVariants, eq(resumeVariants.id, shortlistEntries.variantId))
    .where(and(eq(shortlistEntries.userId, userId), eq(shortlistEntries.day, day)))
    .orderBy(asc(shortlistEntries.rank))
  return rows.map((r) => ({
    ...r,
    reasons: Array.isArray(r.reasons) ? (r.reasons as RankReason[]) : [],
    state: (SHORTLIST_STATES as readonly string[]).includes(r.state) ? (r.state as ShortlistState) : 'open',
  }))
}

/**
 * Set the state of these discoveries' entries (every day they appear on, so
 * an older snapshot never shows them as still open). Returns rows changed.
 */
export async function setState(
  userId: string,
  discoveryIds: readonly string[],
  state: ShortlistState,
  client: DbClient = db,
): Promise<number> {
  if (discoveryIds.length === 0) return 0
  const rows = await client
    .update(shortlistEntries)
    .set({ state, updatedAt: new Date() })
    .where(and(eq(shortlistEntries.userId, userId), inArray(shortlistEntries.discoveryId, [...discoveryIds])))
    .returning()
  return rows.length
}

/** Distinct postings shortlisted on or after `sinceDay` (the funnel's first step). */
export async function countSince(userId: string, sinceDay: string, client: DbClient = db): Promise<number> {
  const [row] = await client
    .select({ c: countDistinct(shortlistEntries.discoveryId) })
    .from(shortlistEntries)
    .where(and(eq(shortlistEntries.userId, userId), gte(shortlistEntries.day, sinceDay)))
  return Number(row?.c ?? 0)
}
