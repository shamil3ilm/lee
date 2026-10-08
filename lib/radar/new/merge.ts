import { clusterKeys, entryNameFor, mergeKeys } from '../cluster'
import { compactMetrics } from '../ingest'
import type { RadarItemInput } from '../types'
import { CATEGORY_RANK, isNewCategory, type NewItemInput, type NewMetrics, type Openness } from './types'

/**
 * How a "what's new" item becomes, or joins, a shared entry. Pure.
 * Counts keep the best value across sources; facts keep the first known;
 * the strongest category wins (a model beats the news story about it); an
 * entry is open when any of its items shows open weights or code.
 */

const MAX_TAGS = 16
const MAX_METRICS_BYTES = 1024
const NUMERIC: ReadonlyArray<keyof NewMetrics> = ['stars', 'likes', 'downloads', 'points', 'comments', 'upvotes', 'trending', 'params']
const FACTS: ReadonlyArray<keyof NewMetrics> = ['license', 'baseModel', 'baseRelation', 'version', 'latest', 'eol', 'language', 'arxivId', 'repoId', 'feedId']

/** The item as the cluster helpers see it (lib/radar/cluster.ts). */
export function asRadarItem(item: NewItemInput): RadarItemInput {
  return {
    source: item.source === 'releases' ? 'feeds' : item.source,
    externalId: item.externalId,
    kind: item.kind,
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt,
    excerpt: item.excerpt,
    metrics: item.metrics,
  }
}

/** Strong cluster keys plus the entity key, so the same entity from two sources always joins. */
export function newItemKeys(item: NewItemInput): string[] {
  return [`entity:${item.entityKey}`, ...clusterKeys(asRadarItem(item), []).strong]
}

/** Metrics within the 1 KB row limit (links go first, then facts). */
export function boundedMetrics(m: NewMetrics): NewMetrics {
  let out = compactMetrics(m) as NewMetrics
  if (JSON.stringify(out).length <= MAX_METRICS_BYTES) return out
  out = { ...out, links: undefined }
  if (JSON.stringify(compactMetrics(out)).length <= MAX_METRICS_BYTES) return compactMetrics(out) as NewMetrics
  return compactMetrics(Object.fromEntries(NUMERIC.map((k) => [k, out[k]])) as NewMetrics) as NewMetrics
}

export function mergeNewMetrics(a: NewMetrics, b: NewMetrics): NewMetrics {
  const out: Record<string, unknown> = { ...a }
  for (const k of NUMERIC) {
    const x = a[k] as number | undefined
    const y = b[k] as number | undefined
    if (typeof y === 'number' && (typeof x !== 'number' || y > x)) out[k] = y
  }
  for (const k of FACTS) if (out[k] === undefined && b[k] !== undefined) out[k] = b[k]
  if (b.createdAt && (!a.createdAt || b.createdAt < a.createdAt)) out.createdAt = b.createdAt
  const links = [...new Set([...(a.links ?? []), ...(b.links ?? [])])].slice(0, 3)
  if (links.length > 0) out.links = links
  return boundedMetrics(out as NewMetrics)
}

export function entryName(item: NewItemInput): string {
  return item.name ?? entryNameFor(asRadarItem(item), null)
}

export function newEntryValues(item: NewItemInput, now: Date) {
  return {
    entityKey: item.entityKey,
    name: entryName(item),
    category: item.category,
    openness: item.openness,
    grp: item.group,
    url: item.url,
    excerpt: item.excerpt,
    keys: mergeKeys([], { strong: newItemKeys(item), term: [] }),
    sources: [item.source],
    tags: [...new Set(item.tags)].slice(0, MAX_TAGS),
    createdAt: item.createdAt,
    firstSeenAt: now,
    lastSeenAt: now,
    variantCount: 0,
    metrics: boundedMetrics(item.metrics),
  }
}

export interface EntryState {
  category: string
  openness: string | null
  grp: string | null
  name: string
  url: string
  excerpt: string
  keys: readonly string[]
  sources: readonly string[]
  tags: readonly string[]
  createdAt: Date | null
  metrics: unknown
}

function mergedOpenness(current: string | null, incoming: Openness | null): string | null {
  if (current === 'open' || incoming === 'open') return 'open'
  return current ?? incoming
}

/** The entry after `item` joins it. */
export function joinPatch(entry: EntryState, item: NewItemInput, now: Date) {
  const current = isNewCategory(entry.category) ? CATEGORY_RANK[entry.category] : 99
  const takeOver = CATEGORY_RANK[item.category] < current
  const created = [entry.createdAt, item.createdAt].filter((d): d is Date => d instanceof Date)
  return {
    keys: mergeKeys(entry.keys, { strong: newItemKeys(item), term: [] }),
    sources: [...new Set([...entry.sources, item.source])],
    tags: [...new Set([...entry.tags, ...item.tags])].slice(0, MAX_TAGS),
    openness: mergedOpenness(entry.openness, item.openness),
    lastSeenAt: now,
    createdAt: created.length > 0 ? new Date(Math.min(...created.map((d) => d.getTime()))) : null,
    metrics: mergeNewMetrics((entry.metrics ?? {}) as NewMetrics, item.metrics),
    // A stronger kind of item (the model behind a story) takes over the entry's face.
    ...(takeOver ? { category: item.category, grp: item.group, name: entryName(item), url: item.url, excerpt: item.excerpt } : {}),
  }
}
