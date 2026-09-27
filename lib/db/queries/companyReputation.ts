import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { companies, companyReputation } from '@/lib/db/schema'
import {
  confirmedSummarySchema,
  factsSchema,
  signalSchema,
  sourceStatusSchema,
  userRatingSchema,
  type CompanyFacts,
  type ConfirmedSummary,
  type ReputationSignal,
  type SourceStatusMap,
  type UserRating,
} from '@/lib/reputation/types'

/**
 * One reputation row per company (docs/company-reviews.md). Every query is
 * scoped by userId. JSON columns are parsed defensively on read: a row
 * written by an older shape degrades to empty lists, never to a crash.
 */

export interface ReputationRecord {
  companyId: string
  signals: ReputationSignal[]
  sourceStatus: SourceStatusMap
  facts: CompanyFacts | null
  userRatings: UserRating[]
  summary: ConfirmedSummary | null
  placesPlaceId: string | null
  fetchedAt: Date | null
}

type Row = typeof companyReputation.$inferSelect

function parseList<T>(raw: unknown, parse: (v: unknown) => T | null): T[] {
  return Array.isArray(raw) ? raw.map(parse).filter((v): v is T => v !== null) : []
}

function safe<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } }) {
  return (v: unknown): T | null => {
    const r = schema.safeParse(v)
    return r.success ? r.data : null
  }
}

function parseStatus(raw: unknown): SourceStatusMap {
  if (!raw || typeof raw !== 'object') return {}
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).flatMap(([k, v]) => {
      const r = sourceStatusSchema.safeParse(v)
      return r.success ? [[k, r.data]] : []
    }),
  ) as SourceStatusMap
}

export function toRecord(row: Row): ReputationRecord {
  return {
    companyId: row.companyId,
    signals: parseList(row.signals, safe(signalSchema)),
    sourceStatus: parseStatus(row.sourceStatus),
    facts: row.facts ? safe(factsSchema)(row.facts) : null,
    userRatings: parseList(row.userRatings, safe(userRatingSchema)),
    summary: row.summary ? safe(confirmedSummarySchema)(row.summary) : null,
    placesPlaceId: row.placesPlaceId,
    fetchedAt: row.fetchedAt,
  }
}

export async function get(userId: string, companyId: string, client: DbClient = db): Promise<ReputationRecord | null> {
  const [row] = await client
    .select()
    .from(companyReputation)
    .where(and(eq(companyReputation.userId, userId), eq(companyReputation.companyId, companyId)))
    .limit(1)
  return row ? toRecord(row) : null
}

type Patch = Partial<Pick<Row, 'signals' | 'sourceStatus' | 'facts' | 'userRatings' | 'summary' | 'placesPlaceId' | 'fetchedAt'>>

/** Insert or update the company's row with `patch`; other columns keep their values. */
async function upsert(userId: string, companyId: string, patch: Patch, client: DbClient): Promise<void> {
  const now = new Date()
  await client
    .insert(companyReputation)
    .values({ companyId, userId, ...patch, updatedAt: now })
    .onConflictDoUpdate({
      target: companyReputation.companyId,
      set: { ...patch, updatedAt: now },
      // A company id never moves between users; the guard is belt and braces.
      setWhere: eq(companyReputation.userId, userId),
    })
}

export function saveFetched(
  userId: string,
  companyId: string,
  data: { signals: readonly ReputationSignal[]; sourceStatus: SourceStatusMap; facts: CompanyFacts | null; fetchedAt: Date },
  client: DbClient = db,
): Promise<void> {
  return upsert(
    userId,
    companyId,
    { signals: data.signals as never, sourceStatus: data.sourceStatus as never, facts: data.facts as never, fetchedAt: data.fetchedAt },
    client,
  )
}

export function saveRatings(userId: string, companyId: string, ratings: readonly UserRating[], client: DbClient = db): Promise<void> {
  return upsert(userId, companyId, { userRatings: ratings as never }, client)
}

export function saveSummary(
  userId: string,
  companyId: string,
  summary: ConfirmedSummary | null,
  client: DbClient = db,
): Promise<void> {
  return upsert(userId, companyId, { summary: (summary ?? null) as never }, client)
}

export function savePlaceId(userId: string, companyId: string, placeId: string, client: DbClient = db): Promise<void> {
  return upsert(userId, companyId, { placesPlaceId: placeId }, client)
}

export interface ConfirmedCompany {
  companyId: string
  name: string
  domain: string | null
  record: ReputationRecord
}

/** The user's companies with a confirmed summary (Scam Shield context). */
export async function listConfirmed(userId: string, client: DbClient = db): Promise<ConfirmedCompany[]> {
  const rows = await client
    .select({ rep: companyReputation, name: companies.name, domain: companies.domain })
    .from(companyReputation)
    .innerJoin(companies, eq(companies.id, companyReputation.companyId))
    .where(and(eq(companyReputation.userId, userId), isNotNull(companyReputation.summary)))
  return rows.map((r) => ({ companyId: r.rep.companyId, name: r.name, domain: r.domain, record: toRecord(r.rep) }))
}

/**
 * Watched companies (any user) whose signals are missing or older than
 * `staleBefore` — the weekly refresh plan. Oldest first, bounded.
 */
export async function staleWatched(
  staleBefore: Date,
  limit: number,
  client: DbClient = db,
): Promise<Array<{ companyId: string; userId: string }>> {
  return client
    .select({ companyId: companies.id, userId: companies.userId })
    .from(companies)
    .leftJoin(companyReputation, eq(companyReputation.companyId, companies.id))
    .where(
      and(
        eq(companies.isWatched, true),
        sql`(${companyReputation.fetchedAt} is null or ${companyReputation.fetchedAt} < ${staleBefore.toISOString()}::timestamptz)`,
      ),
    )
    .orderBy(sql`${companyReputation.fetchedAt} asc nulls first`, companies.createdAt)
    .limit(limit)
}
