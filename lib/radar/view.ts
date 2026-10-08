import * as briefsQ from '@/lib/db/queries/radarBriefs'
import * as feedQ from '@/lib/db/queries/radarFeed'
import * as itemsQ from '@/lib/db/queries/radarItems'
import * as termsQ from '@/lib/db/queries/radarTerms'
import { feedById } from './feeds-catalog'
import { compileTerms, highlightSegments, type CompiledTerm, type Segment } from './match'
import { RADAR_SOURCE_LABELS, isRadarKind, isRadarSource, type RadarKind, type RadarMetrics } from './types'

/**
 * Serializable views for the /radar pages: entries with their matched
 * terms, first-seen dates per source and highlighted item titles. Dates are
 * `YYYY-MM-DD` (rendered US style by lib/ui/date shortDay).
 */

export interface ItemView {
  id: string
  source: string
  sourceLabel: string
  title: Segment[]
  url: string
  excerpt: Segment[]
  day: string
}

export interface FirstSeenView {
  source: string
  label: string
  day: string
  items: number
}

export interface EntryView {
  id: string
  name: string
  kind: RadarKind
  itemCount: number
  read: boolean
  saved: boolean
  hasBrief: boolean
  terms: Array<{ id: string; label: string }>
  firstSeen: FirstSeenView[]
  items: ItemView[]
}

function day(d: Date | null | undefined): string {
  return (d ?? new Date()).toISOString().slice(0, 10)
}

export function sourceLabel(source: string, metrics?: RadarMetrics): string {
  if (source === 'feeds') return feedById(metrics?.feedId)?.label ?? RADAR_SOURCE_LABELS.feeds
  // Items opened from What's new keep its source ids; 'releases' is the only extra one.
  if (source === 'releases') return 'Releases'
  return isRadarSource(source) ? RADAR_SOURCE_LABELS[source] : source
}

export function toItemView(i: feedQ.FeedItem & { metrics?: unknown }, compiled: readonly CompiledTerm[]): ItemView {
  return {
    id: i.id,
    source: i.source,
    sourceLabel: sourceLabel(i.source, i.metrics as RadarMetrics | undefined),
    title: highlightSegments(i.title, compiled),
    url: i.url,
    excerpt: highlightSegments(i.excerpt, compiled),
    day: day(i.publishedAt ?? i.fetchedAt),
  }
}

function firstSeenViews(rows: readonly feedQ.FirstSeen[]): FirstSeenView[] {
  return rows
    .map((r) => {
      const seen = r.firstPublishedAt && r.firstPublishedAt < r.firstFetchedAt ? r.firstPublishedAt : r.firstFetchedAt
      return {
        source: r.feedId ? `${r.source}:${r.feedId}` : r.source,
        label: sourceLabel(r.source, r.feedId ? { feedId: r.feedId } : undefined),
        day: day(seen),
        items: r.items,
      }
    })
    .sort((a, b) => a.day.localeCompare(b.day))
}

async function context(userId: string) {
  const terms = await termsQ.list(userId)
  const active = terms.filter((t) => !t.muted)
  return { compiled: compileTerms(active), labels: new Map(active.map((t) => [t.id, t.term])) }
}

function entryView(
  e: itemsQ.RadarEntryRow,
  ctx: { labels: ReadonlyMap<string, string> },
  firstSeen: readonly feedQ.FirstSeen[],
  items: ItemView[],
  briefed: ReadonlySet<string>,
): EntryView {
  return {
    id: e.id,
    name: e.name,
    kind: isRadarKind(e.kind) ? e.kind : 'news',
    itemCount: e.itemCount,
    read: e.readAt !== null,
    saved: e.savedAt !== null,
    hasBrief: briefed.has(e.id),
    terms: e.matchedTerms.flatMap((id) => {
      const label = ctx.labels.get(id)
      return label ? [{ id, label }] : []
    }),
    firstSeen: firstSeenViews(firstSeen.filter((f) => f.entryId === e.id)),
    items,
  }
}

export async function loadFeed(
  userId: string,
  filters: feedQ.FeedFilters,
  page = 0,
): Promise<{ entries: EntryView[]; hasMore: boolean }> {
  const rows = await feedQ.listEntries(userId, filters, { limit: feedQ.FEED_PAGE_SIZE + 1, offset: page * feedQ.FEED_PAGE_SIZE })
  const visible = rows.slice(0, feedQ.FEED_PAGE_SIZE)
  const ids = visible.map((e) => e.id)
  const [ctx, firstSeen, items, briefed] = await Promise.all([
    context(userId),
    feedQ.firstSeenBySource(userId, ids),
    feedQ.topItems(userId, ids, 3),
    briefsQ.entryIdsWithBriefs(userId, ids),
  ])
  return {
    entries: visible.map((e) =>
      entryView(e, ctx, firstSeen, items.filter((i) => i.entryId === e.id).map((i) => toItemView(i, ctx.compiled)), briefed),
    ),
    hasMore: rows.length > feedQ.FEED_PAGE_SIZE,
  }
}

export async function loadEntry(userId: string, id: string): Promise<{ entry: EntryView; raw: itemsQ.RadarItemRow[] } | null> {
  const e = await itemsQ.getEntry(userId, id)
  if (!e) return null
  const [ctx, firstSeen, raw, briefed] = await Promise.all([
    context(userId),
    feedQ.firstSeenBySource(userId, [id]),
    itemsQ.itemsOfEntry(userId, id),
    briefsQ.entryIdsWithBriefs(userId, [id]),
  ])
  const items = [...raw].reverse().map((i) => toItemView(i, ctx.compiled))
  return { entry: entryView(e, ctx, firstSeen, items, briefed), raw }
}
