import { and, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { radarEntries, radarItems } from '@/lib/db/schema'

/** AI Radar items and entries: the writes the ingest makes. Every function is userId-scoped. */

export type RadarEntryRow = typeof radarEntries.$inferSelect
export type RadarItemRow = typeof radarItems.$inferSelect
export type NewRadarItem = Omit<typeof radarItems.$inferInsert, 'userId' | 'id'>
export type NewRadarEntry = Omit<typeof radarEntries.$inferInsert, 'userId' | 'id'>

export function textArray(values: readonly string[]): SQL {
  if (values.length === 0) return sql`'{}'::text[]`
  return sql`array[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`
}

/** External ids of `source` the user already has, among `ids`. */
export async function existingExternalIds(
  userId: string,
  source: string,
  ids: readonly string[],
  client: DbClient = db,
): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await client
    .select({ externalId: radarItems.externalId })
    .from(radarItems)
    .where(and(eq(radarItems.userId, userId), eq(radarItems.source, source), inArray(radarItems.externalId, [...ids])))
  return new Set(rows.map((r) => r.externalId))
}

/** Entries sharing any of `keys` (cluster candidates). */
export async function entriesByKeys(userId: string, keys: readonly string[], client: DbClient = db): Promise<RadarEntryRow[]> {
  if (keys.length === 0) return []
  return client
    .select()
    .from(radarEntries)
    .where(and(eq(radarEntries.userId, userId), sql`${radarEntries.keys} && ${textArray(keys)}`))
    .limit(20)
}

export async function createEntry(userId: string, values: NewRadarEntry, client: DbClient = db): Promise<RadarEntryRow> {
  const [row] = await client.insert(radarEntries).values({ ...values, userId }).returning()
  if (!row) throw new Error('radar entry insert returned nothing')
  return row
}

export async function updateEntry(
  userId: string,
  id: string,
  patch: Partial<NewRadarEntry>,
  client: DbClient = db,
): Promise<void> {
  await client
    .update(radarEntries)
    .set(patch)
    .where(and(eq(radarEntries.userId, userId), eq(radarEntries.id, id)))
}

/** Insert one item; false when it already exists (a concurrent run). */
export async function insertItem(userId: string, values: NewRadarItem, client: DbClient = db): Promise<boolean> {
  const rows = await client
    .insert(radarItems)
    .values({ ...values, userId })
    .onConflictDoNothing({ target: [radarItems.userId, radarItems.source, radarItems.externalId] })
    .returning()
  return rows.length > 0
}

export async function getEntry(userId: string, id: string, client: DbClient = db): Promise<RadarEntryRow | null> {
  const [row] = await client
    .select()
    .from(radarEntries)
    .where(and(eq(radarEntries.userId, userId), eq(radarEntries.id, id)))
    .limit(1)
  return row ?? null
}

/** Every item of an entry, oldest first. */
export async function itemsOfEntry(userId: string, entryId: string, client: DbClient = db): Promise<RadarItemRow[]> {
  return client
    .select()
    .from(radarItems)
    .where(and(eq(radarItems.userId, userId), eq(radarItems.entryId, entryId)))
    .orderBy(sql`coalesce(${radarItems.publishedAt}, ${radarItems.fetchedAt})`)
    .limit(200)
}

/** Items for re-matching after the watch terms change (bounded by retention). */
export async function itemsForMatching(
  userId: string,
  client: DbClient = db,
): Promise<Array<Pick<RadarItemRow, 'id' | 'title' | 'excerpt' | 'matchedTerms'>>> {
  return client
    .select({ id: radarItems.id, title: radarItems.title, excerpt: radarItems.excerpt, matchedTerms: radarItems.matchedTerms })
    .from(radarItems)
    .where(eq(radarItems.userId, userId))
}

export async function setItemTerms(userId: string, id: string, terms: readonly string[], client: DbClient = db): Promise<void> {
  await client
    .update(radarItems)
    .set({ matchedTerms: [...terms] })
    .where(and(eq(radarItems.userId, userId), eq(radarItems.id, id)))
}

/** Entries' matched terms = the union of their items' (after a re-match). */
export async function refreshEntryTerms(userId: string, client: DbClient = db): Promise<void> {
  await client.execute(sql`
    update radar_entries e set matched_terms = coalesce((
      select array_agg(distinct t order by t) from radar_items i, unnest(i.matched_terms) as t
      where i.entry_id = e.id
    ), '{}'::text[])
    where e.user_id = ${userId}::uuid
  `)
}

export async function setEntryFlags(
  userId: string,
  id: string,
  patch: { readAt?: Date | null; savedAt?: Date | null },
  client: DbClient = db,
): Promise<boolean> {
  const rows = await client
    .update(radarEntries)
    .set(patch)
    .where(and(eq(radarEntries.userId, userId), eq(radarEntries.id, id)))
    .returning()
  return rows.length > 0
}

/** Watched entries the user has not read ("new for your watch terms"). */
export async function countNewWatched(userId: string, client: DbClient = db): Promise<number> {
  const [row] = await client
    .select({ n: sql<number>`count(*)::int` })
    .from(radarEntries)
    .where(
      and(eq(radarEntries.userId, userId), sql`cardinality(${radarEntries.matchedTerms}) > 0`, sql`${radarEntries.readAt} is null`),
    )
  return Number(row?.n ?? 0)
}
