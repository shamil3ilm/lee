import { z } from 'zod'
import { XMLParser } from 'fast-xml-parser'
import type { DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'
import { discoveryFetch } from './http'

const configSchema = z.object({ url: z.string().url() })

interface RssItem {
  title?: string | { '#text'?: string }
  link?: string | { '#text'?: string }
  guid?: string | { '#text'?: string }
  description?: string
  pubDate?: string
  'dc:date'?: string
  category?: string | string[]
}

interface RssFeed {
  rss?: { channel?: { item?: RssItem | RssItem[] } }
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

/**
 * Generic RSS/Atom adapter. Config: { url }. Parses the feed with
 * fast-xml-parser and maps each item to a NormalizedJob. Company name is
 * inferred from the feed hostname since RSS has no dedicated field.
 */
export class RssAdapter implements DiscoveryAdapter {
  readonly kind = 'rss'

  async fetch(config: unknown): Promise<DiscoveryItem[]> {
    const { url } = configSchema.parse(config)
    const res = await discoveryFetch('rss', url, { headers: { accept: 'application/rss+xml, application/xml' } })
    if (!res.ok) throw new Error(`rss ${res.status}`)
    const xml = await res.text()
    const parsed = parser.parse(xml) as RssFeed
    const rawItems =
      parsed.rss?.channel?.item ??
      parsed.feed?.entry ??
      []
    const items = Array.isArray(rawItems) ? rawItems : [rawItems]
    const companyName = new URL(url).hostname.replace(/^www\./, '')
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
          descriptionMd: item.description ?? '',
          techStack: [],
          postedAt: dateStr ? new Date(dateStr) : undefined,
          remoteType: 'unknown',
          employmentType: 'unknown',
          raw: item,
        }
        return { sourceItemId, raw: item, normalized }
      })
      .filter((x): x is DiscoveryItem => x !== null)
  }
}
