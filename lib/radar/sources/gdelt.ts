import { createHash } from 'node:crypto'
import { errorText, requestJson } from '@/lib/reputation/http'
import { GDELT_API, gdeltDay } from '@/lib/reputation/sources/gdelt'
import { cleanTerm, compileTerms, matchTerms, type WatchTermLike } from '../match'
import { dateOrNull, titleOf } from '../text'
import type { RadarItemInput } from '../types'
import { pastDeadline, termsForRun, type RadarFetchDeps, type RadarFetchResult } from './types'

/**
 * News naming a watch term, from the free GDELT DOC 2.0 API (no key; one
 * request per 5 s per IP — the shared host limiter keeps 6 s, as for the
 * company reputation feature). The last 7 days; the headline must name the
 * term on a word boundary, and syndicated copies are collapsed.
 */

const MAX_PER_TERM = 15

interface Article {
  url?: string
  title?: string
  seendate?: string
  domain?: string
}

export function gdeltTermUrl(term: string): string {
  const params = new URLSearchParams({
    query: `"${cleanTerm(term).replace(/"/g, '')}"`,
    mode: 'artlist',
    format: 'json',
    maxrecords: '50',
    sort: 'datedesc',
    timespan: '7d',
  })
  return `${GDELT_API}?${params.toString()}`
}

function idOf(url: string): string {
  return createHash('sha1').update(url).digest('hex').slice(0, 20)
}

export function toGdeltItems(body: unknown, term: WatchTermLike): RadarItemInput[] {
  const raw = (body as { articles?: unknown } | null)?.articles
  const articles = Array.isArray(raw) ? (raw as Article[]) : []
  const compiled = compileTerms([{ ...term, muted: false }])
  const seen = new Set<string>()
  const out: RadarItemInput[] = []
  for (const a of articles) {
    if (!a.url || !a.title || !/^https:\/\//i.test(a.url)) continue
    if (matchTerms([a.title], compiled).length === 0) continue
    const key = a.title.toLowerCase().replace(/\W+/g, ' ').trim()
    if (seen.has(key)) continue
    seen.add(key)
    const day = gdeltDay(a.seendate)
    out.push({
      source: 'gdelt',
      externalId: idOf(a.url),
      kind: 'news',
      title: titleOf(a.title),
      url: a.url,
      publishedAt: day ? dateOrNull(`${day}T00:00:00Z`) : null,
      excerpt: a.domain ? `Reported by ${a.domain.slice(0, 100)}` : '',
      metrics: {},
    })
    if (out.length >= MAX_PER_TERM) break
  }
  return out
}

export async function fetchGdeltTerms(deps: RadarFetchDeps = {}): Promise<RadarFetchResult> {
  const items: RadarItemInput[] = []
  const partialErrors: string[] = []
  for (const term of termsForRun(deps)) {
    if (pastDeadline(deps)) break
    try {
      items.push(...toGdeltItems(await requestJson('gdelt', gdeltTermUrl(term.term), deps), term))
    } catch (e) {
      partialErrors.push(errorText(e))
      // GDELT rate-limits per IP: a 429 means the rest of the run would fail too.
      if (/429/.test(errorText(e))) break
    }
  }
  if (items.length === 0 && partialErrors.length > 0) throw new Error(partialErrors[0])
  return { items, partialErrors }
}
