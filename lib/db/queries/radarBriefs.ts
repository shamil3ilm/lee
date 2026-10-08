import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { radarBriefs } from '@/lib/db/schema'

/** Confirmed AI Radar briefs. Every function is userId-scoped. */

export type RadarBriefRow = typeof radarBriefs.$inferSelect

export interface BriefWrite {
  sections: unknown
  sources: unknown
  timeline: unknown
  promptVersion: string
  promptHash: string
}

export async function getByEntry(userId: string, entryId: string, client: DbClient = db): Promise<RadarBriefRow | null> {
  const [row] = await client
    .select()
    .from(radarBriefs)
    .where(and(eq(radarBriefs.userId, userId), eq(radarBriefs.entryId, entryId)))
    .limit(1)
  return row ?? null
}

/** Save (or replace) the brief of an entry; a replaced brief keeps no module. */
export async function upsert(userId: string, entryId: string, w: BriefWrite, client: DbClient = db): Promise<RadarBriefRow> {
  const [row] = await client
    .insert(radarBriefs)
    .values({ userId, entryId, ...w })
    .onConflictDoUpdate({
      target: radarBriefs.entryId,
      set: { ...w, module: null, updatedAt: sql`now()` },
      setWhere: eq(radarBriefs.userId, userId),
    })
    .returning()
  if (!row) throw new Error('radar brief upsert returned nothing')
  return row
}

export async function setModule(userId: string, id: string, module: unknown, client: DbClient = db): Promise<void> {
  await client
    .update(radarBriefs)
    .set({ module, updatedAt: sql`now()` })
    .where(and(eq(radarBriefs.userId, userId), eq(radarBriefs.id, id)))
}

/** Briefs whose ids are given and that have a module (card lookups). */
export async function modulesByIds(userId: string, ids: readonly string[], client: DbClient = db): Promise<RadarBriefRow[]> {
  if (ids.length === 0) return []
  return client
    .select()
    .from(radarBriefs)
    .where(and(eq(radarBriefs.userId, userId), inArray(radarBriefs.id, [...ids]), isNotNull(radarBriefs.module)))
}

export async function entryIdsWithBriefs(userId: string, entryIds: readonly string[], client: DbClient = db): Promise<Set<string>> {
  if (entryIds.length === 0) return new Set()
  const rows = await client
    .select({ entryId: radarBriefs.entryId })
    .from(radarBriefs)
    .where(and(eq(radarBriefs.userId, userId), inArray(radarBriefs.entryId, [...entryIds])))
  return new Set(rows.map((r) => r.entryId))
}
