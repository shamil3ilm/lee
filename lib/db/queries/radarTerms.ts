import { and, asc, eq, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { radarWatchTerms } from '@/lib/db/schema'

/** AI Radar watch terms. Every function is userId-scoped. */

export type RadarTermRow = typeof radarWatchTerms.$inferSelect

export interface TermWrite {
  term: string
  aliases: string[]
  kind: 'term' | 'entity'
}

export async function list(userId: string, client: DbClient = db): Promise<RadarTermRow[]> {
  return client.select().from(radarWatchTerms).where(eq(radarWatchTerms.userId, userId)).orderBy(asc(radarWatchTerms.createdAt))
}

export async function get(userId: string, id: string, client: DbClient = db): Promise<RadarTermRow | null> {
  const [row] = await client
    .select()
    .from(radarWatchTerms)
    .where(and(eq(radarWatchTerms.userId, userId), eq(radarWatchTerms.id, id)))
    .limit(1)
  return row ?? null
}

/** Insert; null when the user already watches the same term (any case). */
export async function insert(userId: string, w: TermWrite, client: DbClient = db): Promise<RadarTermRow | null> {
  const rows = await client
    .insert(radarWatchTerms)
    .values({ userId, term: w.term, aliases: w.aliases, kind: w.kind })
    .onConflictDoNothing()
    .returning()
  return rows[0] ?? null
}

/** Insert many (starter defaults); existing terms are left alone. */
export async function insertMany(userId: string, ws: readonly TermWrite[], client: DbClient = db): Promise<number> {
  if (ws.length === 0) return 0
  const rows = await client
    .insert(radarWatchTerms)
    .values(ws.map((w) => ({ userId, term: w.term, aliases: w.aliases, kind: w.kind })))
    .onConflictDoNothing()
    .returning()
  return rows.length
}

export async function update(
  userId: string,
  id: string,
  patch: Partial<TermWrite> & { muted?: boolean },
  client: DbClient = db,
): Promise<RadarTermRow | null> {
  const rows = await client
    .update(radarWatchTerms)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(and(eq(radarWatchTerms.userId, userId), eq(radarWatchTerms.id, id)))
    .returning()
  return rows[0] ?? null
}

export async function remove(userId: string, id: string, client: DbClient = db): Promise<boolean> {
  const rows = await client
    .delete(radarWatchTerms)
    .where(and(eq(radarWatchTerms.userId, userId), eq(radarWatchTerms.id, id)))
    .returning()
  return rows.length > 0
}

/** Is `term` (any case) already watched, other than `exceptId`? */
export async function exists(userId: string, term: string, exceptId: string | null, client: DbClient = db): Promise<boolean> {
  const rows = await client
    .select({ id: radarWatchTerms.id })
    .from(radarWatchTerms)
    .where(and(eq(radarWatchTerms.userId, userId), sql`lower(${radarWatchTerms.term}) = lower(${term})`))
  return rows.some((r) => r.id !== exceptId)
}
