import { and, desc, eq, gte, inArray, isNotNull, sql, type SQL } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { radarEntries, radarItems } from '@/lib/db/schema'
import type { RadarEntryRow } from './radarItems'

/** Reads for the /radar feed, the digests and the nav badge. userId-scoped. */

export interface FeedFilters {
  source?: string
  kind?: string
  watched?: boolean
  saved?: boolean
  /** Only entries seen in the last N days. */
  sinceDays?: number
}

export const FEED_PAGE_SIZE = 30

function where(userId: string, f: FeedFilters, now: Date): SQL | undefined {
  return and(
    eq(radarEntries.userId, userId),
    f.source ? sql`${radarEntries.sources} @> array[${f.source}]::text[]` : undefined,
    f.kind ? eq(radarEntries.kind, f.kind) : undefined,
    f.watched ? sql`cardinality(${radarEntries.matchedTerms}) > 0` : undefined,
    f.saved ? isNotNull(radarEntries.savedAt) : undefined,
    f.sinceDays ? gte(radarEntries.lastSeenAt, new Date(now.getTime() - f.sinceDays * 86_400_000)) : undefined,
  )
}

export async function listEntries(
  userId: string,
  f: FeedFilters,
  opts: { limit?: number; offset?: number; now?: Date } = {},
  client: DbClient = db,
): Promise<RadarEntryRow[]> {
  return client
    .select()
    .from(radarEntries)
    .where(where(userId, f, opts.now ?? new Date()))
    .orderBy(desc(radarEntries.lastSeenAt), desc(radarEntries.firstSeenAt))
    .limit(opts.limit ?? FEED_PAGE_SIZE)
    .offset(opts.offset ?? 0)
}

export interface FirstSeen {
  entryId: string
  source: string
  /** Earliest publication date the source reports, else when lee first saw it. */
  firstPublishedAt: Date | null
  firstFetchedAt: Date
  items: number
}

export async function firstSeenBySource(userId: string, entryIds: readonly string[], client: DbClient = db): Promise<FirstSeen[]> {
  if (entryIds.length === 0) return []
  const rows = await client
    .select({
      entryId: radarItems.entryId,
      source: radarItems.source,
      firstPublishedAt: sql<Date | string | null>`min(${radarItems.publishedAt})`,
      firstFetchedAt: sql<Date | string>`min(${radarItems.fetchedAt})`,
      items: sql<number>`count(*)::int`,
    })
    .from(radarItems)
    .where(and(eq(radarItems.userId, userId), inArray(radarItems.entryId, [...entryIds])))
    .groupBy(radarItems.entryId, radarItems.source)
  return rows.map((r) => ({
    entryId: r.entryId,
    source: r.source,
    firstPublishedAt: r.firstPublishedAt ? new Date(r.firstPublishedAt) : null,
    firstFetchedAt: new Date(r.firstFetchedAt),
    items: Number(r.items),
  }))
}

export type FeedItem = Pick<
  typeof radarItems.$inferSelect,
  'id' | 'entryId' | 'source' | 'kind' | 'title' | 'url' | 'publishedAt' | 'fetchedAt' | 'excerpt' | 'matchedTerms'
>

/** The newest `perEntry` items of each entry. */
export async function topItems(userId: string, entryIds: readonly string[], perEntry = 3, client: DbClient = db): Promise<FeedItem[]> {
  if (entryIds.length === 0) return []
  const ranked = client
    .select({
      id: radarItems.id,
      entryId: radarItems.entryId,
      source: radarItems.source,
      kind: radarItems.kind,
      title: radarItems.title,
      url: radarItems.url,
      publishedAt: radarItems.publishedAt,
      fetchedAt: radarItems.fetchedAt,
      excerpt: radarItems.excerpt,
      matchedTerms: radarItems.matchedTerms,
      rank: sql<number>`row_number() over (partition by ${radarItems.entryId} order by ${radarItems.fetchedAt} desc, ${radarItems.publishedAt} desc nulls last)`.as('rank'),
    })
    .from(radarItems)
    .where(and(eq(radarItems.userId, userId), inArray(radarItems.entryId, [...entryIds])))
    .as('ranked')
  const rows = await client.select().from(ranked).where(sql`${ranked.rank} <= ${perEntry}`)
  return rows.map(({ rank: _rank, ...r }) => r)
}

/** Watched, unread entries seen since `since` (digest candidates), newest first. */
export async function watchedSince(userId: string, since: Date, limit = 50, client: DbClient = db): Promise<RadarEntryRow[]> {
  return client
    .select()
    .from(radarEntries)
    .where(
      and(
        eq(radarEntries.userId, userId),
        sql`cardinality(${radarEntries.matchedTerms}) > 0`,
        sql`${radarEntries.readAt} is null`,
        gte(radarEntries.lastSeenAt, since),
      ),
    )
    .orderBy(desc(radarEntries.lastSeenAt))
    .limit(limit)
}
