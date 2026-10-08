import { XMLParser } from 'fast-xml-parser'
import { requestText } from '@/lib/reputation/http'
import { arxivIdOf, dateOrNull, excerptOf, titleOf } from '../text'
import type { RadarItemInput } from '../types'
import type { RadarFetchDeps, RadarFetchResult } from './types'

/**
 * arXiv API (free, no key; the API terms ask for at most one request every
 * three seconds — the shared host limiter keeps 3.1 s). The newest
 * cs.CL / cs.LG / cs.AI submissions, one request per day.
 */

export const ARXIV_API = 'https://export.arxiv.org/api/query'
export const ARXIV_CATEGORIES = ['cs.CL', 'cs.LG', 'cs.AI'] as const
const MAX_RESULTS = 25

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', trimValues: true })

interface AtomLink {
  '@_href'?: string
  '@_rel'?: string
}

interface AtomEntry {
  id?: string
  title?: unknown
  summary?: unknown
  published?: string
  link?: AtomLink | AtomLink[]
  'arxiv:comment'?: unknown
}

function text(v: unknown): string {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && '#text' in v) return String((v as Record<string, unknown>)['#text'] ?? '')
  return ''
}

function asArray<T>(v: T | T[] | undefined): T[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v]
}

/** Code links named in an arXiv comment ("Code: https://github.com/..."), for clustering. */
function codeLinks(comment: string): string[] {
  const urls = comment.match(/https:\/\/(?:github\.com|huggingface\.co)\/[\w.\-/]+/gi) ?? []
  return [...new Set(urls.map((u) => u.replace(/[.)]+$/, '')))].slice(0, 3)
}

export function arxivQueryUrl(max = MAX_RESULTS): string {
  const q = ARXIV_CATEGORIES.map((c) => `cat:${c}`).join(' OR ')
  const params = new URLSearchParams({ search_query: q, sortBy: 'submittedDate', sortOrder: 'descending', max_results: String(max) })
  return `${ARXIV_API}?${params.toString()}`
}

export function toArxivItems(xml: string): RadarItemInput[] {
  const parsed = parser.parse(xml) as { feed?: { entry?: AtomEntry | AtomEntry[] } }
  return asArray(parsed.feed?.entry).flatMap((e): RadarItemInput[] => {
    const id = arxivIdOf(e.id ?? '')
    const title = titleOf(text(e.title))
    if (!id || !title) return []
    const links = codeLinks(text(e['arxiv:comment']))
    return [
      {
        source: 'arxiv',
        externalId: id,
        kind: 'paper',
        title,
        url: `https://arxiv.org/abs/${id}`,
        publishedAt: dateOrNull(e.published),
        excerpt: excerptOf(text(e.summary)),
        metrics: { arxivId: id, ...(links.length > 0 ? { links } : {}) },
      },
    ]
  })
}

export async function fetchArxiv(deps: RadarFetchDeps = {}): Promise<RadarFetchResult> {
  const xml = await requestText('arxiv', arxivQueryUrl(), deps, {}, { accept: 'application/atom+xml' })
  return { items: toArxivItems(xml), partialErrors: [] }
}
