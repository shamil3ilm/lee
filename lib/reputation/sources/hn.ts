import { requestJson } from '../http'
import { companyQueryName, isoDay, mentionsCompany, onCompanyDomain, signalId, truncate } from '../match'
import type { ReputationSignal } from '../types'
import type { CompanyRef, SourceDeps, SourceResult } from './types'

/**
 * Hacker News via the free Algolia API (no key, 10,000 requests/hour/IP):
 * story mentions from the last two years, and the company's history in
 * "Ask HN: Who is hiring?" threads (months with a matching top line).
 */

export const HN_API = 'https://hn.algolia.com/api/v1'
const YEAR_S = 365 * 24 * 60 * 60
const MAX_MENTIONS = 10
const HIRING_THREAD = /^Ask HN: Who is hiring\?/i

interface Hit {
  objectID?: string
  title?: string | null
  url?: string | null
  points?: number | null
  created_at?: string
  created_at_i?: number
  story_title?: string | null
  comment_text?: string | null
}

function hitsOf(body: unknown): Hit[] {
  const hits = (body as { hits?: unknown } | null)?.hits
  return Array.isArray(hits) ? (hits as Hit[]) : []
}

function itemUrl(id: string): string {
  return `https://news.ycombinator.com/item?id=${encodeURIComponent(id)}`
}

function epoch(now: Date): number {
  return Math.floor(now.getTime() / 1000)
}

function quoted(company: CompanyRef): string {
  return encodeURIComponent(`"${companyQueryName(company.name)}"`)
}

export function toMentions(hits: readonly Hit[], company: CompanyRef): ReputationSignal[] {
  return hits
    .filter((h) => h.objectID && h.title)
    .filter((h) => mentionsCompany(h.title, company.name) || onCompanyDomain(h.url, company.domain))
    .slice(0, MAX_MENTIONS)
    .map((h) => {
      const url = itemUrl(h.objectID as string)
      return {
        id: signalId('hn', url),
        source: 'hn' as const,
        kind: 'hn_mention' as const,
        title: truncate(h.title as string),
        url,
        date: isoDay(h.created_at ?? h.created_at_i ?? null),
        category: null,
        value: typeof h.points === 'number' ? h.points : null,
      }
    })
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/&#x2F;/g, '/').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
}

/** The "Company | Role | Location" first line of a hiring comment. */
function headerLine(commentHtml: string | null | undefined): string {
  const first = (commentHtml ?? '').split(/<p>|\n/i)[0] ?? ''
  return stripHtml(first).slice(0, 160)
}

const MONTH =new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })

/** One summary signal for the company's "Who is hiring" posts, or none. */
export function toHiringSignal(hits: readonly Hit[], company: CompanyRef): ReputationSignal | null {
  const posts = hits.filter(
    (h) =>
      h.objectID &&
      HIRING_THREAD.test(h.story_title ?? '') &&
      mentionsCompany(headerLine(h.comment_text), company.name),
  )
  if (posts.length === 0) return null
  const months = new Set(posts.map((p) => isoDay(p.created_at ?? p.created_at_i ?? null)?.slice(0, 7)).filter(Boolean))
  const latest = [...posts].sort((a, b) => (b.created_at_i ?? 0) - (a.created_at_i ?? 0))[0] as Hit
  const latestDay = isoDay(latest.created_at ?? latest.created_at_i ?? null)
  const n = months.size
  const when = latestDay ? `, latest ${MONTH.format(new Date(`${latestDay}T00:00:00Z`))}` : ''
  const url = itemUrl(latest.objectID as string)
  return {
    id: signalId('hn', `hiring:${companyQueryName(company.name)}`),
    source: 'hn',
    kind: 'hn_hiring',
    title: `Posted in ${n} "Who is hiring" thread${n === 1 ? '' : 's'}${when}`,
    url,
    date: latestDay,
    category: null,
    value: n,
  }
}

export async function fetchHackerNews(company: CompanyRef, deps: SourceDeps = {}): Promise<SourceResult> {
  const now = deps.now ?? new Date()
  const q = quoted(company)
  const storiesUrl = `${HN_API}/search?query=${q}&tags=story&hitsPerPage=30&numericFilters=created_at_i>${epoch(now) - 2 * YEAR_S}`
  const hiringUrl = `${HN_API}/search_by_date?query=${q}&tags=comment&hitsPerPage=100&numericFilters=created_at_i>${epoch(now) - 3 * YEAR_S}`
  const stories = hitsOf(await requestJson('hn', storiesUrl, deps))
  const comments = hitsOf(await requestJson('hn', hiringUrl, deps))
  const hiring = toHiringSignal(comments, company)
  return { signals: [...toMentions(stories, company), ...(hiring ? [hiring] : [])] }
}
