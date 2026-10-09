import { and, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { companies, companyReputation, discoveries, radarNewEntries } from '@/lib/db/schema'

/**
 * Reads and writes for the company growth score (lib/company-discovery/
 * growth): launches on AI Radar's shared "What's new", news the user's
 * reputation panel classified, and the growth copied onto job postings.
 */

export interface LaunchRow {
  name: string
  url: string
  at: Date
}

/** Shared What's new entries first seen since `since` (public facts; at most `limit`). */
export async function recentLaunches(since: Date, limit = 5000, client: DbClient = db): Promise<LaunchRow[]> {
  return client
    .select({ name: radarNewEntries.name, url: radarNewEntries.url, at: radarNewEntries.firstSeenAt })
    .from(radarNewEntries)
    .where(gte(radarNewEntries.firstSeenAt, since))
    .limit(limit)
}

export interface ReputationNewsRow {
  domain: string
  signals: unknown
}

/** The user's reputation signals for tracked companies with these domains. */
export async function reputationNewsByDomain(userId: string, domains: readonly string[], client: DbClient = db): Promise<ReputationNewsRow[]> {
  if (domains.length === 0) return []
  const rows = await client
    .select({ domain: companies.domain, signals: companyReputation.signals })
    .from(companyReputation)
    .innerJoin(companies, eq(companies.id, companyReputation.companyId))
    .where(and(eq(companyReputation.userId, userId), isNotNull(companies.domain), inArray(companies.domain, [...domains].slice(0, 3000))))
  return rows.flatMap((r) => (r.domain ? [{ domain: r.domain, signals: r.signals }] : []))
}

export interface PostingCompanyRow {
  id: string
  companyName: string | null
  companyDomain: string | null
  companyGrowth: number | null
  companyGrowthConfidence: string | null
}

/** Recent job postings' employers (for copying growth onto them), newest first. */
export async function postingCompanies(userId: string, since: Date, limit = 5000, client: DbClient = db): Promise<PostingCompanyRow[]> {
  return client
    .select({
      id: discoveries.id,
      companyName: sql<string | null>`${discoveries.normalized}->>'companyName'`,
      companyDomain: sql<string | null>`${discoveries.normalized}->>'companyDomain'`,
      companyGrowth: discoveries.companyGrowth,
      companyGrowthConfidence: discoveries.companyGrowthConfidence,
    })
    .from(discoveries)
    .where(and(eq(discoveries.userId, userId), gte(discoveries.createdAt, since)))
    .limit(limit)
}

/** Set one growth value on many postings (user-scoped). */
export async function setPostingGrowth(userId: string, ids: readonly string[], growth: number | null, confidence: string | null, client: DbClient = db): Promise<void> {
  for (let i = 0; i < ids.length; i += 500) {
    await client
      .update(discoveries)
      .set({ companyGrowth: growth, companyGrowthConfidence: confidence })
      .where(and(eq(discoveries.userId, userId), inArray(discoveries.id, ids.slice(i, i + 500))))
  }
}
