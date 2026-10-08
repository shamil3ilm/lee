import { errorText, requestJson } from '@/lib/reputation/http'
import { HN_API } from '@/lib/reputation/sources/hn'
import { cleanTerm, compileTerms, matchTerms, type WatchTermLike } from '../match'
import { dateOrNull, excerptOf, titleOf } from '../text'
import type { RadarItemInput } from '../types'
import { pastDeadline, termsForRun, type RadarFetchDeps, type RadarFetchResult } from './types'

/**
 * Hacker News stories naming a watch term (Algolia API, free, no key,
 * 10,000 requests an hour per IP — the shared client from the company
 * reputation feature). Stories from the last week; the term must appear in
 * the title or the link, so a passing mention in a long text is not news.
 */

const PER_TERM = 15
const WEEK_S = 7 * 24 * 60 * 60

interface Hit {
  objectID?: string
  title?: string | null
  url?: string | null
  points?: number | null
  num_comments?: number | null
  created_at?: string
  created_at_i?: number
  story_text?: string | null
}

export function hnTermUrl(term: string, now: Date): string {
  const q = encodeURIComponent(`"${cleanTerm(term).replace(/"/g, '')}"`)
  const since = Math.floor(now.getTime() / 1000) - WEEK_S
  return `${HN_API}/search_by_date?query=${q}&tags=story&hitsPerPage=${PER_TERM}&numericFilters=created_at_i>${since}`
}

export function toHnItems(body: unknown, term: WatchTermLike): RadarItemInput[] {
  const raw = (body as { hits?: unknown } | null)?.hits
  const hits = Array.isArray(raw) ? (raw as Hit[]) : []
  const compiled = compileTerms([{ ...term, muted: false }])
  return hits.flatMap((h): RadarItemInput[] => {
    if (!h.objectID || !h.title) return []
    if (matchTerms([h.title, h.url], compiled).length === 0) return []
    const link = typeof h.url === 'string' && /^https?:\/\//i.test(h.url) ? h.url : null
    return [
      {
        source: 'hn',
        externalId: h.objectID,
        kind: 'news',
        title: titleOf(h.title),
        url: `https://news.ycombinator.com/item?id=${encodeURIComponent(h.objectID)}`,
        publishedAt: dateOrNull(h.created_at ?? h.created_at_i),
        excerpt: excerptOf(h.story_text),
        metrics: {
          points: typeof h.points === 'number' ? h.points : undefined,
          comments: typeof h.num_comments === 'number' ? h.num_comments : undefined,
          ...(link ? { links: [link] } : {}),
        },
      },
    ]
  })
}

export async function fetchHnTerms(deps: RadarFetchDeps = {}): Promise<RadarFetchResult> {
  const now = deps.now ?? new Date()
  const items: RadarItemInput[] = []
  const partialErrors: string[] = []
  for (const term of termsForRun(deps)) {
    if (pastDeadline(deps)) break
    try {
      items.push(...toHnItems(await requestJson('hn', hnTermUrl(term.term, now), deps), term))
    } catch (e) {
      partialErrors.push(errorText(e))
    }
  }
  if (items.length === 0 && partialErrors.length > 0) throw new Error(partialErrors[0])
  return { items, partialErrors }
}
