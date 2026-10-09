import { and, arrayOverlaps, count, desc, eq, gte, inArray, isNotNull, or, sql, type SQL } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { db, type DbClient } from '@/lib/db/client'
import { companyDiscoveries } from '@/lib/db/schema'
import type * as schema from '@/lib/db/schema'

/** See discoveries.ts `writer`: exposes `returning(fields)` on the driver union. */
function writer(client: DbClient): PostgresJsDatabase<typeof schema> {
  return client as unknown as PostgresJsDatabase<typeof schema>
}

/**
 * Company discovery rows for the Companies tab (local companies & startups)
 * and the jobs that fill them. Every query is user-scoped.
 */

export type CompanyRow = typeof companyDiscoveries.$inferSelect

export interface CompanyInsert {
  sourceCompanyId: string
  name: string
  website: string | null
  domain: string | null
  regionIds: string[]
  industry: string[]
  sizeBand: string | null
  stage: string | null
  sourceTags: string[]
  evidence: Record<string, unknown>
  normalized: Record<string, unknown>
  /** The company's own board, when a polled source already reads it (employers seen in jobs). */
  board?: { kind: string; slug: string; url: string; sourceId?: string }
}

const CHUNK = 100

/**
 * Insert new companies; for ones the source already has, union the source
 * tags, region ids and industries and fill missing website / size / stage
 * (never touching status, watch or the user's choices). Returns the ids of
 * rows inserted (new) and updated.
 */
export async function upsertCompanies(
  userId: string,
  sourceId: string,
  rows: readonly CompanyInsert[],
  client: DbClient = db,
): Promise<{ inserted: string[]; updated: number }> {
  const inserted: string[] = []
  let updated = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const res = await writer(client)
      .insert(companyDiscoveries)
      .values(
        chunk.map((r) => ({
          userId,
          sourceId,
          sourceCompanyId: r.sourceCompanyId,
          raw: {},
          normalized: r.normalized as never,
          website: r.website,
          domain: r.domain,
          regionIds: r.regionIds,
          industry: r.industry,
          sizeBand: r.sizeBand,
          stage: r.stage,
          sourceTags: r.sourceTags,
          evidence: r.evidence as never,
          enrichStatus: r.website || r.evidence.githubLogin || r.evidence.profileUrl ? 'pending' : null,
          atsKind: r.board?.kind ?? null,
          atsSlug: r.board?.slug ?? null,
          careersUrl: r.board?.url ?? null,
          watch: r.board?.sourceId ? 'jobs' : null,
          watchSourceId: r.board?.sourceId ?? null,
        })),
      )
      .onConflictDoUpdate({
        target: [companyDiscoveries.sourceId, companyDiscoveries.sourceCompanyId],
        set: {
          sourceTags: sql`(select array(select distinct unnest(${companyDiscoveries.sourceTags} || excluded.source_tags) order by 1))`,
          regionIds: sql`(select array(select distinct unnest(${companyDiscoveries.regionIds} || excluded.region_ids) order by 1))`,
          industry: sql`(select array(select distinct unnest(${companyDiscoveries.industry} || excluded.industry) order by 1))`,
          website: sql`coalesce(${companyDiscoveries.website}, excluded.website)`,
          domain: sql`coalesce(${companyDiscoveries.domain}, excluded.domain)`,
          sizeBand: sql`coalesce(${companyDiscoveries.sizeBand}, excluded.size_band)`,
          stage: sql`coalesce(${companyDiscoveries.stage}, excluded.stage)`,
          evidence: sql`excluded.evidence || ${companyDiscoveries.evidence}`,
          enrichStatus: sql`case when ${companyDiscoveries.enrichStatus} is null and coalesce(${companyDiscoveries.website}, excluded.website) is not null then 'pending' else ${companyDiscoveries.enrichStatus} end`,
          atsKind: sql`coalesce(${companyDiscoveries.atsKind}, excluded.ats_kind)`,
          atsSlug: sql`case when ${companyDiscoveries.atsKind} is null then excluded.ats_slug else ${companyDiscoveries.atsSlug} end`,
          careersUrl: sql`coalesce(${companyDiscoveries.careersUrl}, excluded.careers_url)`,
          watch: sql`coalesce(${companyDiscoveries.watch}, excluded.watch)`,
          watchSourceId: sql`coalesce(${companyDiscoveries.watchSourceId}, excluded.watch_source_id)`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: companyDiscoveries.id, createdAt: companyDiscoveries.createdAt, updatedAt: companyDiscoveries.updatedAt })
    for (const r of res) {
      if (r.createdAt.getTime() === r.updatedAt.getTime()) inserted.push(r.id)
      else updated += 1
    }
  }
  return { inserted, updated }
}

/** Source company ids the source already stores (for the per-run cap on new rows). */
export async function existingKeys(sourceId: string, keys: readonly string[], client: DbClient = db): Promise<Set<string>> {
  if (keys.length === 0) return new Set()
  const rows = await client
    .select({ k: companyDiscoveries.sourceCompanyId })
    .from(companyDiscoveries)
    .where(and(eq(companyDiscoveries.sourceId, sourceId), inArray(companyDiscoveries.sourceCompanyId, [...keys])))
  return new Set(rows.map((r) => r.k))
}

/** Domains the user already has from OTHER sources (YC directory, a manual add…): not duplicated. */
export async function domainsElsewhere(userId: string, sourceId: string, domains: readonly string[], client: DbClient = db): Promise<Set<string>> {
  if (domains.length === 0) return new Set()
  const rows = await client
    .select({ d: companyDiscoveries.domain })
    .from(companyDiscoveries)
    .where(
      and(
        eq(companyDiscoveries.userId, userId),
        sql`${companyDiscoveries.sourceId} <> ${sourceId}`,
        inArray(companyDiscoveries.domain, [...domains]),
      ),
    )
  return new Set(rows.flatMap((r) => (r.d ? [r.d] : [])))
}

export async function countForSource(sourceId: string, client: DbClient = db): Promise<number> {
  const [r] = await client.select({ c: count() }).from(companyDiscoveries).where(eq(companyDiscoveries.sourceId, sourceId))
  return Number(r?.c ?? 0)
}

export interface CompanyListOpts {
  /** 'all' = new and saved (everything in play). */
  status: 'new' | 'saved' | 'dismissed' | 'all'
  /** Watched (a job board or careers page), whatever the status. */
  watching?: boolean
  /** Expanded region ids (selection + descendants). */
  regionIds?: readonly string[]
  industry?: string
  stage?: string
  hiring?: boolean
  warm?: boolean
  sourceTag?: string
  /** Growth score at least this (unknown growth is left out). */
  minGrowth?: number
  /** "Under the radar" only. */
  gems?: boolean
  /** Best fit first (default), best growth, most open roles (unknown last), or newest. */
  sort?: CompanySort
  limit?: number
  offset?: number
}

export type CompanySort = 'fit' | 'growth' | 'roles' | 'newest'

function sortOrder(sort: CompanySort | undefined): SQL[] {
  const fit = sql`${companyDiscoveries.fitScore} desc nulls last`
  switch (sort) {
    case 'growth':
      return [sql`${companyDiscoveries.growthScore} desc nulls last`, fit]
    case 'roles':
      return [sql`(${companyDiscoveries.evidence}->>'openRoles')::int desc nulls last`, fit]
    case 'newest':
      return []
    default:
      return [fit]
  }
}

function listWhere(userId: string, o: CompanyListOpts): SQL {
  const conds: SQL[] = [
    eq(companyDiscoveries.userId, userId),
    o.status === 'all' ? inArray(companyDiscoveries.status, ['new', 'saved']) : eq(companyDiscoveries.status, o.status),
  ]
  if (o.watching) conds.push(isNotNull(companyDiscoveries.watch))
  if (o.regionIds && o.regionIds.length > 0) conds.push(arrayOverlaps(companyDiscoveries.regionIds, [...o.regionIds]))
  if (o.industry) conds.push(arrayOverlaps(companyDiscoveries.industry, [o.industry]))
  if (o.stage) conds.push(eq(companyDiscoveries.stage, o.stage))
  if (o.hiring) conds.push(or(isNotNull(companyDiscoveries.atsKind), isNotNull(companyDiscoveries.careersUrl))!)
  if (o.warm) conds.push(sql`coalesce((${companyDiscoveries.evidence}->>'connections')::int, 0) > 0`)
  if (o.sourceTag) conds.push(arrayOverlaps(companyDiscoveries.sourceTags, [o.sourceTag]))
  if (typeof o.minGrowth === 'number' && o.minGrowth > 0) conds.push(gte(companyDiscoveries.growthScore, o.minGrowth))
  if (o.gems) conds.push(eq(companyDiscoveries.hiddenGem, true))
  return and(...conds)!
}

export async function listCompanies(userId: string, o: CompanyListOpts, client: DbClient = db): Promise<CompanyRow[]> {
  return client
    .select()
    .from(companyDiscoveries)
    .where(listWhere(userId, o))
    .orderBy(
      ...sortOrder(o.sort),
      desc(companyDiscoveries.createdAt),
      desc(companyDiscoveries.id),
    )
    .limit(o.limit ?? 25)
    .offset(o.offset ?? 0)
}

export async function countCompanies(userId: string, o: Omit<CompanyListOpts, 'limit' | 'offset' | 'sort'>, client: DbClient = db): Promise<number> {
  const [r] = await client.select({ c: count() }).from(companyDiscoveries).where(listWhere(userId, o))
  return Number(r?.c ?? 0)
}

export async function getCompany(userId: string, id: string, client: DbClient = db): Promise<CompanyRow | undefined> {
  const [r] = await client
    .select()
    .from(companyDiscoveries)
    .where(and(eq(companyDiscoveries.userId, userId), eq(companyDiscoveries.id, id)))
    .limit(1)
  return r
}

/** Rows waiting for enrichment, best fit first. */
export async function pendingEnrichment(userId: string, limit: number, client: DbClient = db): Promise<CompanyRow[]> {
  return client
    .select()
    .from(companyDiscoveries)
    .where(and(eq(companyDiscoveries.userId, userId), eq(companyDiscoveries.enrichStatus, 'pending'), eq(companyDiscoveries.status, 'new')))
    .orderBy(sql`${companyDiscoveries.fitScore} desc nulls last`, companyDiscoveries.createdAt)
    .limit(limit)
}

export async function countPending(userId: string, client: DbClient = db): Promise<number> {
  const [r] = await client
    .select({ c: count() })
    .from(companyDiscoveries)
    .where(and(eq(companyDiscoveries.userId, userId), eq(companyDiscoveries.enrichStatus, 'pending'), eq(companyDiscoveries.status, 'new')))
  return Number(r?.c ?? 0)
}

/** Every row of the user's companies in play (new / saved), for the fit backfill. */
export async function inPlay(userId: string, client: DbClient = db): Promise<CompanyRow[]> {
  return client
    .select()
    .from(companyDiscoveries)
    .where(and(eq(companyDiscoveries.userId, userId), inArray(companyDiscoveries.status, ['new', 'saved'])))
}

export type CompanyPatch = Partial<
  Pick<
    CompanyRow,
    | 'website'
    | 'domain'
    | 'careersUrl'
    | 'atsKind'
    | 'atsSlug'
    | 'evidence'
    | 'fitScore'
    | 'fitDetail'
    | 'enrichStatus'
    | 'enrichedAt'
    | 'watch'
    | 'watchSourceId'
    | 'careersHash'
    | 'careersCheckedAt'
    | 'careersChangedAt'
    | 'status'
    | 'dismissReason'
    | 'applicationId'
    | 'industry'
    | 'normalized'
    | 'sourceTags'
    | 'regionIds'
    | 'growthScore'
    | 'growthConfidence'
    | 'growthDetail'
    | 'growthCheckedAt'
    | 'roleSnapshots'
    | 'hiddenGem'
    | 'sizeBand'
  >
>

export async function patchCompany(userId: string, id: string, patch: CompanyPatch, client: DbClient = db): Promise<void> {
  await client
    .update(companyDiscoveries)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(companyDiscoveries.userId, userId), eq(companyDiscoveries.id, id)))
}

/** Careers pages under weekly change detection (robots allowed at enrichment). */
export async function careersWatched(userId: string, client: DbClient = db): Promise<CompanyRow[]> {
  return client
    .select()
    .from(companyDiscoveries)
    .where(and(eq(companyDiscoveries.userId, userId), eq(companyDiscoveries.watch, 'careers'), isNotNull(companyDiscoveries.careersHash)))
}

/** Facets for the filters: the source tags and industries the user's companies have. */
export async function facets(userId: string, client: DbClient = db): Promise<{ sources: string[]; industries: string[] }> {
  const rows = await client.execute(sql`
    select array(select distinct t from company_discoveries c, unnest(c.source_tags) t where c.user_id = ${userId} order by 1) as sources,
           array(select distinct t from company_discoveries c, unnest(c.industry) t where c.user_id = ${userId} order by 1) as industries
  `)
  const first = ((rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[]))[0] as
    | { sources?: string[] | null; industries?: string[] | null }
    | undefined
  return { sources: first?.sources ?? [], industries: first?.industries ?? [] }
}

export interface FoldRow {
  id: string
  sourceCompanyId: string
  name: string
  domain: string | null
  regionIds: string[]
  sourceTags: string[]
  status: string
  watch: string | null
  applicationId: string | null
  evidence: Record<string, unknown>
}

/** Compact index of a source's rows for the duplicate fold (lib/company-discovery/fold.ts). */
export async function foldIndex(sourceId: string, client: DbClient = db): Promise<FoldRow[]> {
  const rows = await client
    .select({
      id: companyDiscoveries.id,
      sourceCompanyId: companyDiscoveries.sourceCompanyId,
      name: sql<string>`coalesce(${companyDiscoveries.normalized}->>'name', '')`,
      domain: companyDiscoveries.domain,
      regionIds: companyDiscoveries.regionIds,
      sourceTags: companyDiscoveries.sourceTags,
      status: companyDiscoveries.status,
      watch: companyDiscoveries.watch,
      applicationId: companyDiscoveries.applicationId,
      evidence: companyDiscoveries.evidence,
    })
    .from(companyDiscoveries)
    .where(eq(companyDiscoveries.sourceId, sourceId))
  return rows.map((r) => ({ ...r, evidence: (r.evidence ?? {}) as Record<string, unknown> }))
}

/** Delete rows the fold merged into another (user-scoped). */
export async function deleteCompanies(userId: string, ids: readonly string[], client: DbClient = db): Promise<number> {
  if (ids.length === 0) return 0
  const res = await writer(client)
    .delete(companyDiscoveries)
    .where(and(eq(companyDiscoveries.userId, userId), inArray(companyDiscoveries.id, [...ids])))
    .returning({ id: companyDiscoveries.id })
  return res.length
}
