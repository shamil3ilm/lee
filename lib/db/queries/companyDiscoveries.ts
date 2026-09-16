import { and, eq, gte, inArray, isNull, or } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { companyDiscoveries } from '@/lib/db/schema'

export type CompanyDiscovery = typeof companyDiscoveries.$inferSelect
export type NewCompanyDiscovery = typeof companyDiscoveries.$inferInsert
export type CompanyDiscoveryStatus = 'new' | 'saved' | 'dismissed'

export interface UpsertCompanyResult {
  discovery: CompanyDiscovery
  isNew: boolean
}

export async function upsertBySource(
  userId: string,
  sourceId: string,
  sourceItemId: string,
  raw: unknown,
  normalized: unknown,
  client: DbClient = db,
): Promise<UpsertCompanyResult> {
  const [inserted] = await client
    .insert(companyDiscoveries)
    .values({
      userId,
      sourceId,
      sourceCompanyId: sourceItemId,
      raw: raw as never,
      normalized: normalized as never,
    })
    .onConflictDoNothing({
      target: [companyDiscoveries.sourceId, companyDiscoveries.sourceCompanyId],
    })
    .returning()
  if (inserted) return { discovery: inserted, isNew: true }
  const existing = await client.query.companyDiscoveries.findFirst({
    where: and(
      eq(companyDiscoveries.sourceId, sourceId),
      eq(companyDiscoveries.sourceCompanyId, sourceItemId),
    ),
  })
  if (!existing) throw new Error('upsertBySource(company): could not insert or find')
  return { discovery: existing, isNew: false }
}

export interface ListOpts {
  status?: CompanyDiscoveryStatus | 'all'
  minScore?: number
  sourceIds?: string[]
  limit?: number
}

export async function list(
  userId: string,
  opts: ListOpts = {},
  client: DbClient = db,
): Promise<CompanyDiscovery[]> {
  const conds = [eq(companyDiscoveries.userId, userId)]
  if (opts.status && opts.status !== 'all') {
    conds.push(eq(companyDiscoveries.status, opts.status))
  }
  if (typeof opts.minScore === 'number') {
    conds.push(
      or(
        gte(companyDiscoveries.matchScore, opts.minScore),
        isNull(companyDiscoveries.matchScore),
      )!,
    )
  }
  if (opts.sourceIds && opts.sourceIds.length > 0) {
    conds.push(inArray(companyDiscoveries.sourceId, opts.sourceIds))
  }
  return client.query.companyDiscoveries.findMany({
    where: and(...conds),
    orderBy: (d, { desc }) => [desc(d.matchScore), desc(d.createdAt)],
    limit: opts.limit,
  })
}

export async function getById(
  userId: string,
  id: string,
  client: DbClient = db,
): Promise<CompanyDiscovery | undefined> {
  return client.query.companyDiscoveries.findFirst({
    where: and(eq(companyDiscoveries.userId, userId), eq(companyDiscoveries.id, id)),
  })
}

export async function updateScore(
  userId: string,
  id: string,
  matchScore: number,
  reasoning: unknown,
  client: DbClient = db,
): Promise<void> {
  await client
    .update(companyDiscoveries)
    .set({ matchScore, matchReasoning: reasoning as never, updatedAt: new Date() })
    .where(and(eq(companyDiscoveries.userId, userId), eq(companyDiscoveries.id, id)))
}

export async function setStatus(
  userId: string,
  id: string,
  status: CompanyDiscoveryStatus,
  extra: Partial<NewCompanyDiscovery> = {},
  client: DbClient = db,
): Promise<void> {
  await client
    .update(companyDiscoveries)
    .set({ status, updatedAt: new Date(), ...extra })
    .where(and(eq(companyDiscoveries.userId, userId), eq(companyDiscoveries.id, id)))
}
