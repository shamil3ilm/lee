import { and, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { linkedinConnections, linkedinImports, linkedinPosts } from '@/lib/db/schema'

/** LinkedIn import, connections and post history. Every query is user-scoped. */

export type LinkedInImportRow = typeof linkedinImports.$inferSelect
export type LinkedInConnectionRow = typeof linkedinConnections.$inferSelect
export type LinkedInPostRow = typeof linkedinPosts.$inferSelect

export async function saveImport(
  userId: string,
  input: { headline: string; summary: string; positions: Array<Record<string, string>> },
): Promise<void> {
  await db
    .insert(linkedinImports)
    .values({ userId, ...input })
    .onConflictDoUpdate({ target: linkedinImports.userId, set: { ...input, importedAt: sql`now()` } })
}

export async function getImport(userId: string): Promise<LinkedInImportRow | null> {
  const [row] = await db.select().from(linkedinImports).where(eq(linkedinImports.userId, userId)).limit(1)
  return row ?? null
}

export async function deleteImport(userId: string): Promise<void> {
  await db.delete(linkedinImports).where(eq(linkedinImports.userId, userId))
}

export interface ConnectionInput {
  name: string
  company: string
  companyKey: string
  position: string
  connectedOn: string | null
  email: string | null
}

const CHUNK = 500

/**
 * Insert or refresh (natural key: name + company). Idempotent on re-import.
 * New rows are tagged with `importBatchId`; refreshed rows keep the batch
 * that first added them, so undoing a re-import never removes older ones.
 */
export async function upsertConnections(userId: string, rows: readonly ConnectionInput[], importBatchId: string | null = null): Promise<number> {
  let n = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((r) => ({ userId, ...r, importBatchId }))
    if (chunk.length === 0) continue
    await db
      .insert(linkedinConnections)
      .values(chunk)
      .onConflictDoUpdate({
        target: [linkedinConnections.userId, linkedinConnections.name, linkedinConnections.companyKey],
        set: {
          company: sql`excluded.company`,
          position: sql`excluded.position`,
          connectedOn: sql`excluded.connected_on`,
          email: sql`excluded.email`,
        },
      })
    n += chunk.length
  }
  return n
}

export async function countConnections(userId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(linkedinConnections).where(eq(linkedinConnections.userId, userId))
  return row?.n ?? 0
}

export async function searchConnections(userId: string, q: string, limit = 50): Promise<LinkedInConnectionRow[]> {
  const term = q.trim().slice(0, 100).replace(/[\\%_]/g, (c) => `\\${c}`)
  const where = term
    ? and(eq(linkedinConnections.userId, userId), or(ilike(linkedinConnections.name, `%${term}%`), ilike(linkedinConnections.company, `%${term}%`), ilike(linkedinConnections.position, `%${term}%`)))
    : eq(linkedinConnections.userId, userId)
  return db.select().from(linkedinConnections).where(where).orderBy(desc(linkedinConnections.connectedOn), linkedinConnections.name).limit(limit)
}

/**
 * Connections whose company matches `key` as a whole-word prefix either
 * way: "careem" matches "careem networks" and the reverse. Count + up to
 * `limit` rows, most recent connections first.
 */
export async function byCompanyMatch(userId: string, key: string, limit = 5): Promise<{ count: number; rows: LinkedInConnectionRow[] }> {
  if (!key) return { count: 0, rows: [] }
  // Keys are [a-z0-9 ] only (lib/integrations/linkedin/company-key.ts): no LIKE wildcards to escape.
  if (!/^[a-z0-9 ]+$/.test(key)) return { count: 0, rows: [] }
  const match = and(
    eq(linkedinConnections.userId, userId),
    or(
      eq(linkedinConnections.companyKey, key),
      sql`${linkedinConnections.companyKey} like ${`${key} %`}`,
      sql`${key} like (${linkedinConnections.companyKey} || ' %')`,
    ),
  )
  const [counted] = await db.select({ n: sql<number>`count(*)::int` }).from(linkedinConnections).where(match)
  const count = counted?.n ?? 0
  if (count === 0) return { count, rows: [] }
  const rows = await db.select().from(linkedinConnections).where(match).orderBy(sql`${linkedinConnections.connectedOn} desc nulls last`, linkedinConnections.name).limit(limit)
  return { count, rows }
}

/**
 * Connections per company (normalized key), most first: the warm-intro
 * signal and the "companies you know people at" source of company
 * discovery. Counts and the company name only.
 */
export async function companyCounts(userId: string, limit = 2_000): Promise<Array<{ key: string; company: string; n: number }>> {
  const rows = await db
    .select({
      key: linkedinConnections.companyKey,
      company: sql<string>`min(${linkedinConnections.company})`,
      n: sql<number>`count(*)::int`,
    })
    .from(linkedinConnections)
    .where(and(eq(linkedinConnections.userId, userId), sql`${linkedinConnections.companyKey} <> ''`))
    .groupBy(linkedinConnections.companyKey)
    .orderBy(sql`count(*) desc`, linkedinConnections.companyKey)
    .limit(limit)
  return rows.map((r) => ({ key: r.key, company: r.company, n: Number(r.n) }))
}

/** Connections with exactly this name (case-insensitive): "the poster is one of your connections". */
export async function byName(userId: string, name: string, limit = 3): Promise<LinkedInConnectionRow[]> {
  const n = name.trim().toLowerCase()
  if (!n) return []
  return db
    .select()
    .from(linkedinConnections)
    .where(and(eq(linkedinConnections.userId, userId), sql`lower(${linkedinConnections.name}) = ${n}`))
    .limit(limit)
}

/** Rows a given import batch added. */
export async function countConnectionsByBatch(userId: string, importBatchId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(linkedinConnections)
    .where(and(eq(linkedinConnections.userId, userId), eq(linkedinConnections.importBatchId, importBatchId)))
  return row?.n ?? 0
}

export async function deleteConnectionsByBatch(userId: string, importBatchId: string): Promise<number> {
  const rows = await db
    .delete(linkedinConnections)
    .where(and(eq(linkedinConnections.userId, userId), eq(linkedinConnections.importBatchId, importBatchId)))
    .returning()
  return rows.length
}

export async function deleteAllConnections(userId: string): Promise<number> {
  const rows = await db.delete(linkedinConnections).where(eq(linkedinConnections.userId, userId)).returning()
  return rows.length
}

export async function addPost(userId: string, input: { sourceKind: string; text: string; postUrn: string | null; url: string | null }): Promise<LinkedInPostRow> {
  const [row] = await db.insert(linkedinPosts).values({ userId, ...input }).returning()
  if (!row) throw new Error('linkedin_posts insert returned no row')
  return row
}

export async function listPosts(userId: string, limit = 20): Promise<LinkedInPostRow[]> {
  return db.select().from(linkedinPosts).where(eq(linkedinPosts.userId, userId)).orderBy(desc(linkedinPosts.postedAt)).limit(limit)
}
