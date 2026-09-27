import { z } from 'zod'
import { XMLParser } from 'fast-xml-parser'
import type { DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'
import { discoveryFetch } from './http'
import { employmentTypeOf, geoTag, toDate } from './prefs'

/**
 * We Work Remotely category RSS feeds (no key).
 * https://weworkremotely.com/remote-job-rss-feed
 *
 * Terms (feed page, 2026-09-27): "Anyone can use the feed, all we ask is
 * that you attribute the links back to We Work Remotely" — applyUrl is the
 * WWR posting link and the source is named after WWR.
 *
 * Titles are "Company: Role"; <region> says who may apply.
 */

export const WWR_FEEDS: Readonly<Record<string, string>> = {
  'back-end': 'https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss',
  'full-stack': 'https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss',
  programming: 'https://weworkremotely.com/categories/remote-programming-jobs.rss',
}

const configSchema = z
  .object({ categories: z.array(z.enum(['back-end', 'full-stack', 'programming'])).optional() })
  .passthrough()

const DEFAULT_CATEGORIES = ['back-end', 'full-stack'] as const

interface WwrItem {
  title?: string
  link?: string
  guid?: string | { '#text'?: string }
  region?: string
  country?: string
  skills?: string
  category?: string
  type?: string
  pubDate?: string
}

const parser = new XMLParser({ ignoreAttributes: true, trimValues: true, processEntities: true })

function text(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && typeof (v as { '#text'?: unknown })['#text'] === 'string') {
    return (v as { '#text': string })['#text']
  }
  return undefined
}

export function parseWwrFeed(xml: string): DiscoveryItem[] {
  const parsed = parser.parse(xml) as { rss?: { channel?: { item?: WwrItem | WwrItem[] } } }
  const raw = parsed.rss?.channel?.item ?? []
  const list = Array.isArray(raw) ? raw : [raw]
  const out: DiscoveryItem[] = []
  for (const item of list) {
    const title = text(item.title)
    const link = text(item.link)
    if (!title || !link) continue
    const sep = title.indexOf(': ')
    const companyName = sep > 0 ? title.slice(0, sep).trim() : 'Unknown company'
    const role = sep > 0 ? title.slice(sep + 2).trim() : title
    const region = text(item.region)?.trim() ?? ''
    const worldwide = /anywhere in the world/i.test(region)
    const skills = (text(item.skills) ?? '')
      .split(/,\s*(?:and\s+)?|\s+and\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
    const rawItem = { guid: text(item.guid) ?? link, title, region, category: text(item.category), pubDate: item.pubDate }
    const normalized: NormalizedJob = {
      kind: 'job',
      title: role,
      companyName,
      location: region ? `Remote (${region})` : 'Remote',
      remoteType: 'remote',
      employmentType: employmentTypeOf(text(item.type)),
      descriptionMd: '',
      applyUrl: link,
      postedAt: toDate(item.pubDate),
      techStack: skills,
      tags: ['board:weworkremotely', geoTag(worldwide)],
      raw: rawItem,
    }
    out.push({ sourceItemId: text(item.guid) ?? link, raw: rawItem, normalized })
  }
  return out
}

export class WeWorkRemotelyAdapter implements DiscoveryAdapter {
  readonly kind = 'weworkremotely'

  async fetch(config: unknown): Promise<DiscoveryItem[]> {
    const parsed = configSchema.safeParse(config ?? {})
    const categories = parsed.success && parsed.data.categories?.length ? parsed.data.categories : [...DEFAULT_CATEGORIES]
    const items = new Map<string, DiscoveryItem>()
    let succeeded = 0
    let lastError: Error | null = null
    for (const category of categories) {
      const url = WWR_FEEDS[category]!
      const res = await discoveryFetch('weworkremotely', url, {
        headers: { accept: 'application/rss+xml, application/xml' },
      })
      if (!res.ok) {
        lastError = new Error(`weworkremotely ${res.status}`)
        continue
      }
      succeeded += 1
      for (const item of parseWwrFeed(await res.text())) {
        if (!items.has(item.sourceItemId)) items.set(item.sourceItemId, item)
      }
    }
    if (succeeded === 0 && lastError) throw lastError
    return [...items.values()]
  }
}
