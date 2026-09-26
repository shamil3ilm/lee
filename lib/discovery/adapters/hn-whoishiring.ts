import type { DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'
import { discoveryFetch } from './http'
import { HN_ITEM_TIMEOUT_MS } from '@/lib/net/timeout'
import { mapWithConcurrency } from '@/lib/util/concurrency'

interface AlgoliaSearchResponse {
  hits?: { objectID?: string; title?: string }[]
}

interface HnItem {
  id?: number
  text?: string
  by?: string
  time?: number
  kids?: number[]
}

const MAX_COMMENTS = 100
const ITEM_CONCURRENCY = 8

/**
 * Ask HN: Who is hiring? scraper — but only against structured HN APIs
 * (Algolia + Firebase). Comments are the raw source; we regex-parse the first
 * line for the well-established `Company | Role | Location | Remote/Onsite`
 * convention and skip any comment that does not conform.
 */
export class HnWhoIsHiringAdapter implements DiscoveryAdapter {
  readonly kind = 'hn_whoishiring'

  async fetch(_config: unknown): Promise<DiscoveryItem[]> {
    const threadId = await this.findLatestThreadId()
    if (!threadId) return []
    const kids = await this.fetchThreadKids(threadId)
    const commentIds = kids.slice(0, MAX_COMMENTS)
    // Up to 100 item fetches: run them a few at a time (each with its own
    // short timeout) instead of one after another.
    const comments = await mapWithConcurrency(commentIds, ITEM_CONCURRENCY, (cid) =>
      this.fetchItem(cid),
    )
    const items: DiscoveryItem[] = []
    for (const [i, cid] of commentIds.entries()) {
      const comment = comments[i]
      if (!comment?.text) continue
      const parsed = parseCommentHeader(comment.text)
      if (!parsed) continue
      const normalized: NormalizedJob = {
        kind: 'job',
        title: parsed.role,
        companyName: parsed.company,
        location: parsed.location,
        remoteType: parsed.remoteType,
        employmentType: 'unknown',
        applyUrl: `https://news.ycombinator.com/item?id=${cid}`,
        descriptionMd: stripHtml(comment.text),
        techStack: [],
        postedAt: comment.time ? new Date(comment.time * 1000) : undefined,
        raw: comment,
      }
      items.push({ sourceItemId: String(cid), raw: comment, normalized })
    }
    return items
  }

  private async findLatestThreadId(): Promise<string | null> {
    const url =
      'https://hn.algolia.com/api/v1/search?tags=story&query=Ask+HN+Who+is+hiring&hitsPerPage=1&numericFilters=points>50'
    const res = await discoveryFetch('hn-algolia', url)
    if (!res.ok) throw new Error(`hn-algolia ${res.status}`)
    const body = (await res.json()) as AlgoliaSearchResponse
    return body.hits?.[0]?.objectID ?? null
  }

  private async fetchThreadKids(id: string): Promise<number[]> {
    const res = await discoveryFetch('hn-item', `https://hacker-news.firebaseio.com/v0/item/${id}.json`)
    if (!res.ok) throw new Error(`hn-item ${res.status}`)
    const body = (await res.json()) as HnItem
    return body.kids ?? []
  }

  /** One comment; a failed or slow fetch just drops that comment. */
  private async fetchItem(id: number): Promise<HnItem | null> {
    try {
      const res = await discoveryFetch(
        'hn-item',
        `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
        {},
        HN_ITEM_TIMEOUT_MS,
      )
      if (!res.ok) return null
      return (await res.json()) as HnItem
    } catch {
      return null
    }
  }
}

export function parseCommentHeader(text: string): {
  company: string
  role: string
  location?: string
  remoteType: NormalizedJob['remoteType']
} | null {
  // Strip common HN HTML wrappers and take the first non-empty line.
  const plain = stripHtml(text)
  const firstLine = plain.split(/\r?\n/).map((s) => s.trim()).find(Boolean)
  if (!firstLine) return null
  // Pattern: Company | Role | Location | Remote/Onsite | ...
  const parts = firstLine
    .split(/\s*[|·•–—]\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length < 2) return null
  const [company, role, ...rest] = parts as [string, string, ...string[]]
  const restBlob = rest.join(' ').toLowerCase()
  const remoteType: NormalizedJob['remoteType'] =
    /remote/.test(restBlob)
      ? 'remote'
      : /hybrid/.test(restBlob)
        ? 'hybrid'
        : /onsite|on-site/.test(restBlob)
          ? 'onsite'
          : 'unknown'
  // Location is usually the first "rest" segment before the remote/onsite tag.
  const location = rest.find(
    (p) => !/^(remote|hybrid|onsite|on-site|visa|full[- ]?time|contract)/i.test(p.trim()),
  )
  return { company, role, location, remoteType }
}

function stripHtml(s: string): string {
  return s
    .replace(/<p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .trim()
}
