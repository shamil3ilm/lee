import { and, desc, eq, gte, inArray, sql, type SQL } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { radarEntries, radarNewEntries, radarNewItems } from '@/lib/db/schema'
import { textArray } from './radarItems'

/**
 * "What's new" shared rows (no user id: public facts only). Writes come
 * from the daily shared fetch (lib/radar/new/store.ts); reads from every
 * user's What's new tab and digest, ranked per user in memory.
 */

export type NewEntryRow = typeof radarNewEntries.$inferSelect
export type NewItemRow = typeof radarNewItems.$inferSelect
export type NewEntryValues = Omit<typeof radarNewEntries.$inferInsert, 'id'>
export type NewItemValues = Omit<typeof radarNewItems.$inferInsert, 'id'>

/** externalId → its stored row, among `ids` of `source`. */
export async function existingItems(
  source: string,
  ids: readonly string[],
  client: DbClient = db,
): Promise<Map<string, Pick<NewItemRow, 'id' | 'entryId' | 'metrics'>>> {
  if (ids.length === 0) return new Map()
  const rows = await client
    .select({ id: radarNewItems.id, entryId: radarNewItems.entryId, metrics: radarNewItems.metrics, externalId: radarNewItems.externalId })
    .from(radarNewItems)
    .where(and(eq(radarNewItems.source, source), inArray(radarNewItems.externalId, [...ids])))
  return new Map(rows.map(({ externalId, ...r }) => [externalId, r]))
}

/** Entity key → the entity key of the entry holding it (itself for a primary, the base for a folded variant). */
export async function entityRoots(entityKeys: readonly string[], client: DbClient = db): Promise<Map<string, string>> {
  if (entityKeys.length === 0) return new Map()
  const wanted = entityKeys.map((k) => `entity:${k}`)
  const rows = await client
    .select({ entityKey: radarNewEntries.entityKey, keys: radarNewEntries.keys })
    .from(radarNewEntries)
    .where(sql`${radarNewEntries.keys} && ${textArray(wanted)}`)
  const out = new Map<string, string>()
  for (const r of rows) for (const k of entityKeys) if (r.keys.includes(`entity:${k}`)) out.set(k, r.entityKey)
  return out
}

export async function entriesByKeys(keys: readonly string[], client: DbClient = db): Promise<NewEntryRow[]> {
  if (keys.length === 0) return []
  return client
    .select()
    .from(radarNewEntries)
    .where(sql`${radarNewEntries.keys} && ${textArray(keys)}`)
    .limit(20)
}

export async function entryByEntityKey(entityKey: string, client: DbClient = db): Promise<NewEntryRow | null> {
  const [row] = await client.select().from(radarNewEntries).where(eq(radarNewEntries.entityKey, entityKey)).limit(1)
  return row ?? null
}

export async function createEntry(values: NewEntryValues, client: DbClient = db): Promise<NewEntryRow | null> {
  const [row] = await client.insert(radarNewEntries).values(values).onConflictDoNothing({ target: radarNewEntries.entityKey }).returning()
  return row ?? null
}

export async function updateEntry(id: string, patch: Partial<NewEntryValues>, client: DbClient = db): Promise<void> {
  await client.update(radarNewEntries).set(patch).where(eq(radarNewEntries.id, id))
}

/** Insert one item; false when (source, external id) already exists. */
export async function insertItem(values: NewItemValues, client: DbClient = db): Promise<boolean> {
  const rows = await client
    .insert(radarNewItems)
    .values(values)
    .onConflictDoNothing({ target: [radarNewItems.source, radarNewItems.externalId] })
    .returning()
  return rows.length > 0
}

export async function updateItemMetrics(id: string, metrics: unknown, client: DbClient = db): Promise<void> {
  await client.update(radarNewItems).set({ metrics }).where(eq(radarNewItems.id, id))
}

/** Items a source added since `since` (the per-day cap). */
export async function countAddedSince(source: string, since: Date, client: DbClient = db): Promise<number> {
  const [row] = await client
    .select({ n: sql<number>`count(*)::int` })
    .from(radarNewItems)
    .where(and(eq(radarNewItems.source, source), gte(radarNewItems.fetchedAt, since)))
  return Number(row?.n ?? 0)
}

export interface CandidateFilters {
  /** Created (or, when unknown, first seen) in the last N days. */
  sinceDays: number
  category?: string
  openOnly?: boolean
  group?: string
}

export const MAX_CANDIDATES = 600

function candidateWhere(f: CandidateFilters, now: Date): SQL | undefined {
  const since = new Date(now.getTime() - f.sinceDays * 86_400_000)
  return and(
    sql`coalesce(${radarNewEntries.createdAt}, ${radarNewEntries.firstSeenAt}) >= ${since.toISOString()}::timestamptz`,
    f.category ? eq(radarNewEntries.category, f.category) : undefined,
    f.openOnly ? eq(radarNewEntries.openness, 'open') : undefined,
    f.group ? eq(radarNewEntries.grp, f.group) : undefined,
  )
}

/** Candidates for one user's ranking (bounded; ranked in memory). */
export async function listCandidates(f: CandidateFilters, now: Date = new Date(), client: DbClient = db): Promise<NewEntryRow[]> {
  return client
    .select()
    .from(radarNewEntries)
    .where(candidateWhere(f, now))
    .orderBy(desc(radarNewEntries.firstSeenAt))
    .limit(MAX_CANDIDATES)
}

/** Candidates lee first saw since `since` (the weekly digest). */
export async function firstSeenSince(since: Date, client: DbClient = db): Promise<NewEntryRow[]> {
  return client
    .select()
    .from(radarNewEntries)
    .where(gte(radarNewEntries.firstSeenAt, since))
    .orderBy(desc(radarNewEntries.firstSeenAt))
    .limit(MAX_CANDIDATES)
}

export async function getEntry(id: string, client: DbClient = db): Promise<NewEntryRow | null> {
  const [row] = await client.select().from(radarNewEntries).where(eq(radarNewEntries.id, id)).limit(1)
  return row ?? null
}

/** The primary (non-variant) items of the given entries, oldest first. */
export async function itemsOf(entryIds: readonly string[], client: DbClient = db): Promise<NewItemRow[]> {
  if (entryIds.length === 0) return []
  return client
    .select()
    .from(radarNewItems)
    .where(and(inArray(radarNewItems.entryId, [...entryIds]), eq(radarNewItems.role, 'primary')))
    .orderBy(sql`coalesce(${radarNewItems.publishedAt}, ${radarNewItems.fetchedAt})`)
    .limit(entryIds.length * 12)
}

/** The user's own Radar entries opened from these "what's new" entries (key new:<id>): newId → entry id. */
export async function userEntriesForNew(userId: string, newIds: readonly string[], client: DbClient = db): Promise<Map<string, string>> {
  if (newIds.length === 0) return new Map()
  const wanted = newIds.map((id) => `new:${id}`)
  const rows = await client
    .select({ id: radarEntries.id, keys: radarEntries.keys })
    .from(radarEntries)
    .where(and(eq(radarEntries.userId, userId), sql`${radarEntries.keys} && ${textArray(wanted)}`))
  const out = new Map<string, string>()
  for (const r of rows) for (const id of newIds) if (r.keys.includes(`new:${id}`)) out.set(id, r.id)
  return out
}
