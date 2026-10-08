import { createHash } from 'node:crypto'
import { XMLParser } from 'fast-xml-parser'
import { errorText, MAX_FEED_BYTES, requestText } from '@/lib/reputation/http'
import { OFFICIAL_FEEDS, type OfficialFeed } from '../feeds-catalog'
import { dateOrNull, excerptOf, titleOf } from '../text'
import type { RadarItemInput } from '../types'
import { pastDeadline, type RadarFetchDeps, type RadarFetchResult } from './types'

/**
 * Official announcement feeds (lib/radar/feeds-catalog.ts), RSS 2.0 or
 * Atom. Only posts from the last FEED_WINDOW_DAYS, at most PER_FEED per
 * feed; one feed failing never stops the others.
 */

export const FEED_WINDOW_DAYS = 14
const PER_FEED = 8
const DAY_MS = 86_400_000

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', trimValues: true })

interface Link {
  '@_href'?: string
  '@_rel'?: string
}

interface RawItem {
  title?: unknown
  link?: unknown
  guid?: unknown
  id?: unknown
  pubDate?: string
  published?: string
  updated?: string
  'dc:date'?: string
  description?: unknown
  summary?: unknown
  content?: unknown
}

function text(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (v && typeof v === 'object' && '#text' in v) return String((v as Record<string, unknown>)['#text'] ?? '')
  return ''
}

function asArray<T>(v: T | T[] | undefined): T[] {
  return v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]
}

/** RSS `<link>text</link>` or Atom `<link rel="alternate" href>`. */
function linkOf(item: RawItem): string | null {
  const direct = text(item.link)
  if (/^https?:\/\//i.test(direct)) return direct
  const links = asArray(item.link as Link | Link[] | undefined).filter((l) => typeof l === 'object' && l !== null)
  const alt = links.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') ?? links[0]
  const href = alt?.['@_href']
  return typeof href === 'string' && /^https?:\/\//i.test(href) ? href : null
}

function idOf(feedId: string, key: string): string {
  return `${feedId}:${createHash('sha1').update(key).digest('hex').slice(0, 16)}`
}

export function toFeedItems(xml: string, feed: OfficialFeed, now: Date): RadarItemInput[] {
  const parsed = parser.parse(xml) as { rss?: { channel?: { item?: RawItem | RawItem[] } }; feed?: { entry?: RawItem | RawItem[] } }
  const raw = asArray(parsed.rss?.channel?.item ?? parsed.feed?.entry)
  const since = now.getTime() - FEED_WINDOW_DAYS * DAY_MS
  const out: RadarItemInput[] = []
  for (const item of raw) {
    const url = linkOf(item)
    const title = titleOf(text(item.title))
    if (!url || !title || !url.startsWith('https://')) continue
    const published = dateOrNull(item.pubDate ?? item.published ?? item['dc:date'] ?? item.updated)
    if (!published || published.getTime() < since || published.getTime() > now.getTime() + DAY_MS) continue
    out.push({
      source: 'feeds',
      externalId: idOf(feed.id, text(item.guid) || text(item.id) || url),
      kind: 'product',
      title,
      url,
      publishedAt: published,
      excerpt: excerptOf(text(item.description) || text(item.summary) || text(item.content)),
      metrics: { feedId: feed.id },
    })
    if (out.length >= PER_FEED) break
  }
  return out
}

export async function fetchOfficialFeeds(
  deps: RadarFetchDeps & { feeds?: readonly OfficialFeed[] } = {},
): Promise<RadarFetchResult> {
  const now = deps.now ?? new Date()
  const items: RadarItemInput[] = []
  const partialErrors: string[] = []
  for (const feed of deps.feeds ?? OFFICIAL_FEEDS) {
    if (pastDeadline(deps)) break
    try {
      const xml = await requestText(`feed ${feed.id}`, feed.url, deps, {}, {
        accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8',
        maxBytes: MAX_FEED_BYTES,
      })
      items.push(...toFeedItems(xml, feed, now))
    } catch (e) {
      partialErrors.push(errorText(e))
    }
  }
  if (items.length === 0 && partialErrors.length >= (deps.feeds ?? OFFICIAL_FEEDS).length) {
    throw new Error(partialErrors[0] ?? 'every feed failed')
  }
  return { items, partialErrors }
}
