import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { companies, discoveries, jobComparison } from '@/lib/db/schema'
import type { Discovery } from './discoveries'

/**
 * The private job_comparison row (lib/db/schema-compare.ts). Raw JSON in
 * and out; lib/compare validates it. Never logged.
 */

export interface JobComparisonRow {
  currentJob: unknown
  assumptions: unknown
  narratives: unknown
  factorShortlist: boolean
}

const EMPTY: JobComparisonRow = { currentJob: null, assumptions: {}, narratives: {}, factorShortlist: false }

export async function get(userId: string, client: DbClient = db): Promise<JobComparisonRow> {
  const [row] = await client.select().from(jobComparison).where(eq(jobComparison.userId, userId)).limit(1)
  if (!row) return EMPTY
  return {
    currentJob: row.currentJob,
    assumptions: row.assumptions,
    narratives: row.narratives,
    factorShortlist: row.factorShortlist,
  }
}

type Patch = Partial<{ currentJob: unknown; assumptions: unknown; narratives: unknown; factorShortlist: boolean }>

export async function save(userId: string, patch: Patch, client: DbClient = db): Promise<void> {
  const now = new Date()
  await client
    .insert(jobComparison)
    .values({ userId, ...patch, updatedAt: now })
    .onConflictDoUpdate({ target: jobComparison.userId, set: { ...patch, updatedAt: now } })
}

/** The user's discoveries by id (job rows only, any status). */
export async function discoveriesByIds(userId: string, ids: readonly string[], client: DbClient = db): Promise<Discovery[]> {
  if (ids.length === 0) return []
  return client
    .select()
    .from(discoveries)
    .where(and(eq(discoveries.userId, userId), inArray(discoveries.id, [...ids])))
}

/** Store (or clear) a pasted job description on one of the user's discoveries. Returns rows changed. */
export async function setPastedJd(userId: string, discoveryId: string, text: string | null, client: DbClient = db): Promise<number> {
  const where = and(eq(discoveries.userId, userId), eq(discoveries.id, discoveryId))
  const [found] = await client.select({ id: discoveries.id }).from(discoveries).where(where).limit(1)
  if (!found) return 0
  await client.update(discoveries).set({ pastedJd: text, updatedAt: new Date() }).where(where)
  return 1
}

/** The user's company matching a posting by domain, else by exact name (case-insensitive). */
export async function findCompany(
  userId: string,
  match: { domain: string | null; name: string | null },
  client: DbClient = db,
): Promise<{ id: string; name: string } | null> {
  const domain = match.domain?.toLowerCase().replace(/^www\./, '') ?? null
  const name = match.name?.trim().toLowerCase() ?? null
  if (!domain && !name) return null
  const conds = [
    ...(domain ? [eq(sql`lower(${companies.domain})`, domain)] : []),
    ...(name ? [eq(sql`lower(${companies.name})`, name)] : []),
  ]
  const rows = await client
    .select({ id: companies.id, name: companies.name, domain: companies.domain })
    .from(companies)
    .where(and(eq(companies.userId, userId), or(...conds)))
    .limit(5)
  const byDomain = domain ? rows.find((r) => r.domain?.toLowerCase().replace(/^www\./, '') === domain) : undefined
  const hit = byDomain ?? rows[0]
  return hit ? { id: hit.id, name: hit.name } : null
}
