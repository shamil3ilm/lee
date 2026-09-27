import { classifyHeadline } from '../classify'
import { requestJson } from '../http'
import { companyQueryName, isoDay, mentionsCompany, signalId, truncate } from '../match'
import type { ReputationSignal } from '../types'
import type { CompanyRef, SourceDeps, SourceResult } from './types'

/**
 * News via the free GDELT DOC 2.0 API (no key; one request per 5 s per IP,
 * enforced by the host limiter). One request per refresh covers the last
 * 3 months — the API's rolling window; weekly refreshes accumulate older
 * items in the stored signals. Headlines must name the company.
 */

export const GDELT_API = 'https://api.gdeltproject.org/api/v2/doc/doc'
const MAX_NEWS = 20
const TOPICS =
  '(layoff OR layoffs OR lawsuit OR sued OR fraud OR salaries OR wages OR visa OR funding OR raises OR acquires)'

interface Article {
  url?: string
  title?: string
  seendate?: string
  domain?: string
  language?: string
}

/** "20260915T120000Z" → "2026-09-15". */
export function gdeltDay(seendate: string | undefined): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(seendate ?? '')
  return m ? isoDay(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`) : null
}

export function buildGdeltUrl(company: CompanyRef): string {
  const query = `"${companyQueryName(company.name)}" ${TOPICS}`
  const params = new URLSearchParams({
    query,
    mode: 'artlist',
    format: 'json',
    maxrecords: '75',
    sort: 'datedesc',
    timespan: '3months',
  })
  return `${GDELT_API}?${params.toString()}`
}

export function toNewsSignals(body: unknown, company: CompanyRef): ReputationSignal[] {
  const raw = (body as { articles?: unknown } | null)?.articles
  const articles = Array.isArray(raw) ? (raw as Article[]) : []
  const seenTitles = new Set<string>()
  const out: ReputationSignal[] = []
  for (const a of articles) {
    if (!a.url || !a.title || !/^https?:\/\//i.test(a.url)) continue
    if (!mentionsCompany(a.title, company.name)) continue
    const key = a.title.toLowerCase().replace(/\W+/g, ' ').trim()
    if (seenTitles.has(key)) continue // syndicated copies
    seenTitles.add(key)
    out.push({
      id: signalId('gdelt', a.url),
      source: 'gdelt',
      kind: 'news',
      title: truncate(a.title),
      url: a.url,
      date: gdeltDay(a.seendate),
      category: classifyHeadline(a.title),
      value: null,
    })
    if (out.length >= MAX_NEWS) break
  }
  return out
}

export async function fetchGdeltNews(company: CompanyRef, deps: SourceDeps = {}): Promise<SourceResult> {
  const body = await requestJson('gdelt', buildGdeltUrl(company), deps)
  return { signals: toNewsSignals(body, company) }
}
