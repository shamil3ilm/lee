import { z } from 'zod'
import { XMLParser } from 'fast-xml-parser'
import type { DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'
import { untrustedDiscoveryFetch } from './http'
import { htmlToText } from './html-text'

const configSchema = z.object({ url: z.string().url() })

interface RssItem {
  title?: string | { '#text'?: string }
  link?: string | { '#text'?: string }
  guid?: string | { '#text'?: string }
  description?: string
  pubDate?: string
  'dc:date'?: string
  category?: string | string[]
  /** Teamtailor: <tt:locations><tt:location><tt:city/><tt:country/>… */
  'tt:locations'?: { 'tt:location'?: TtLocation | TtLocation[] }
  /** Teamtailor: none | hybrid | temporary | fully. */
  remoteStatus?: string
  /** Generic job feeds. */
  location?: string
  'job:location'?: string
}

interface TtLocation {
  'tt:name'?: string
  'tt:city'?: string
  'tt:country'?: string
}

interface RssFeed {
  rss?: { channel?: { title?: string; item?: RssItem | RssItem[] } }
  feed?: { entry?: RssItem | RssItem[] } // Atom fallback (minimal)
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
})

function asText(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && '#text' in (v as Record<string, unknown>)) {
    const t = (v as Record<string, unknown>)['#text']
    if (typeof t === 'string') return t
  }
  return undefined
}

/** "Dubai, United Arab Emirates; Riyadh, Saudi Arabia" from Teamtailor's location block. */
function ttLocation(block: RssItem['tt:locations']): string | undefined {
  const raw = block?.['tt:location']
  const list = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw]
  const names = list
    .map((l) => [asText(l['tt:city']) ?? asText(l['tt:name']), asText(l['tt:country'])].filter(Boolean).join(', '))
    .filter(Boolean)
  return names.length > 0 ? [...new Set(names)].join('; ') : undefined
}

const TT_REMOTE: Readonly<Record<string, NormalizedJob['remoteType']>> = {
  fully: 'remote',
  hybrid: 'hybrid',
  temporary: 'hybrid',
  none: 'onsite',
}

/**
 * Generic RSS/Atom adapter. Config: { url }. Parses the feed with
 * fast-xml-parser and maps each item to a NormalizedJob. Company name is
 * the channel title, else the feed hostname. Teamtailor feeds (e.g.
 * Chalhoub, Qashio) carry locations and the remote status in their own
 * elements; read since 2026-10-08 (before, every location was empty).
 */
export class RssAdapter implements DiscoveryAdapter {
  readonly kind = 'rss'

  async fetch(config: unknown): Promise<DiscoveryItem[]> {
    const { url } = configSchema.parse(config)
    const res = await untrustedDiscoveryFetch('rss', url, { headers: { accept: 'application/rss+xml, application/xml' } })
    if (!res.ok) throw new Error(`rss ${res.status}`)
    const xml = await res.text()
    const parsed = parser.parse(xml) as RssFeed
    const rawItems =
      parsed.rss?.channel?.item ??
      parsed.feed?.entry ??
      []
    const items = Array.isArray(rawItems) ? rawItems : [rawItems]
    // Teamtailor channels are titled with the employer; generic feeds are not.
    const channelTitle = /xmlns:tt=/.test(xml) ? asText(parsed.rss?.channel?.title)?.trim() : undefined
    const companyName = channelTitle || new URL(url).hostname.replace(/^www\./, '')
    return items
      .map((item, idx): DiscoveryItem | null => {
        const title = asText(item.title)
        const link = asText(item.link)
        if (!title || !link) return null
        const sourceItemId = asText(item.guid) ?? link ?? `${url}#${idx}`
        const dateStr = item.pubDate ?? item['dc:date']
        const normalized: NormalizedJob = {
          kind: 'job',
          title,
          companyName,
          applyUrl: link,
          location: ttLocation(item['tt:locations']) ?? asText(item.location) ?? asText(item['job:location']),
          descriptionMd: htmlToText(asText(item.description)),
          techStack: [],
          postedAt: dateStr ? new Date(dateStr) : undefined,
          remoteType: TT_REMOTE[(item.remoteStatus ?? '').toLowerCase()] ?? 'unknown',
          employmentType: 'unknown',
          raw: item,
        }
        return { sourceItemId, raw: item, normalized }
      })
      .filter((x): x is DiscoveryItem => x !== null)
  }
}
