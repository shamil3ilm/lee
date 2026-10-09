import { and, desc, eq, gte, inArray, ne, or, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { applications, companies, discoveries, jobs, sources } from '@/lib/db/schema'

/**
 * Employers the user has seen hiring (lib/company-discovery/sources/jobs.ts
 * turns them into company discoveries): job postings from every source
 * (ATS boards, email alerts, Google Alerts, pasted imports, park boards),
 * the companies of their applications and their watch list. User-scoped,
 * bounded, read-only.
 */

export interface PostingEmployerRow {
  companyName: string | null
  companyDomain: string | null
  companyWebsite: string | null
  location: string | null
  regionIds: string[]
  sourceKind: string
  sourceConfig: unknown
  sourceId: string
  createdAt: Date
}

/** Recent postings' employer fields (newest first, at most `limit`). */
export async function recentPostingEmployers(userId: string, since: Date, limit = 5000, client: DbClient = db): Promise<PostingEmployerRow[]> {
  return client
    .select({
      companyName: sql<string | null>`${discoveries.normalized}->>'companyName'`,
      companyDomain: sql<string | null>`${discoveries.normalized}->>'companyDomain'`,
      companyWebsite: sql<string | null>`${discoveries.normalized}->>'companyWebsite'`,
      location: sql<string | null>`${discoveries.normalized}->>'location'`,
      regionIds: discoveries.regionIds,
      sourceKind: sources.kind,
      sourceConfig: sources.config,
      sourceId: sources.id,
      createdAt: discoveries.createdAt,
    })
    .from(discoveries)
    .innerJoin(sources, eq(sources.id, discoveries.sourceId))
    .where(and(eq(discoveries.userId, userId), gte(discoveries.createdAt, since), ne(sources.kind, 'local_companies')))
    .orderBy(desc(discoveries.createdAt))
    .limit(limit)
}

export interface TrackedEmployerRow {
  name: string
  domain: string | null
  website: string | null
  city: string | null
  country: string | null
  watched: boolean
}

/** Companies on the watch list or with an application (at most `limit`). */
export async function trackedEmployers(userId: string, limit = 500, client: DbClient = db): Promise<TrackedEmployerRow[]> {
  const applied = client
    .select({ id: jobs.companyId })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(eq(applications.userId, userId))
  return client
    .select({
      name: companies.name,
      domain: companies.domain,
      website: companies.website,
      city: companies.headquartersCity,
      country: companies.headquartersCountry,
      watched: companies.isWatched,
    })
    .from(companies)
    .where(and(eq(companies.userId, userId), or(eq(companies.isWatched, true), inArray(companies.id, applied))))
    .limit(limit)
}
