import { resolveLocation } from '@/lib/regions/normalize'
import { isRegionId } from '@/lib/regions/tree'
import { deepestRegions, domainOf, nameKey } from '../normalize'
import type { CompanyCandidate } from '../types'

/**
 * Employers seen in jobs become companies: every employer of a posting lee
 * collected (ATS boards, email alerts, Google Alerts, pasted imports, park
 * job boards), of an application, or on the watch list is a company
 * discovery, placed by the posting's location. This catches companies that
 * hire but sit in no directory. Pure, client-safe; the rows come from
 * lib/db/queries/companyEmployers.ts.
 */

export const JOBS_TAG = 'jobs'
/** Postings older than this do not create companies (a stale alert is no hiring signal). */
export const JOBS_LOOKBACK_DAYS = 120
/** Employers turned into candidates per run, most postings first. */
export const MAX_JOB_EMPLOYERS = 300

/** Placeholder employer names on postings (agencies hiding the client, alert digests). */
const NOT_AN_EMPLOYER = /^(confidential|undisclosed|anonymous|company confidential|hiring company|leading (?:company|organi[sz]ation|client)|(?:a|our) client|reputed (?:company|organi[sz]ation)|n\/?a|unknown|various|multiple companies|top companies?)\b/i
const RECRUITER = /\b(recruit(?:ment|ing|ers?)|staffing|manpower|placements?|hr consultan\w*|headhunt\w*)\b/i

/** Job-board source kinds whose config names the employer's board. */
const BOARD_KINDS: Readonly<Record<string, (slug: string) => string>> = {
  greenhouse: (s) => `https://boards.greenhouse.io/${s}`,
  lever: (s) => `https://jobs.lever.co/${s}`,
  ashby: (s) => `https://jobs.ashbyhq.com/${s}`,
  workable: (s) => `https://apply.workable.com/${s}`,
  recruitee: (s) => `https://${s}.recruitee.com/`,
  pinpoint: (s) => `https://${s}.pinpointhq.com/`,
}
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/

export interface PostingEmployer {
  companyName: string | null
  companyDomain: string | null
  companyWebsite: string | null
  location: string | null
  regionIds: readonly string[]
  sourceKind: string
  sourceConfig: unknown
  sourceId: string
  createdAt: Date
}

export interface TrackedEmployer {
  name: string
  domain: string | null
  website: string | null
  city: string | null
  country: string | null
  watched: boolean
}

/** A posting's employer name, or null for placeholders and staffing agencies. */
export function employerName(raw: string | null | undefined): string | null {
  const name = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
  if (name.length < 2 || NOT_AN_EMPLOYER.test(name) || RECRUITER.test(name)) return null
  return nameKey(name) ? name : null
}

function placesOf(regionIds: readonly string[], location: string | null): string[] {
  const tagged = regionIds.filter((r) => isRegionId(r) && !r.startsWith('remote'))
  const places = tagged.length > 0 ? tagged : resolveLocation(location).places.map((p) => p.id)
  return deepestRegions(places)
}

/** The board a job-board source polls, as company fields. */
export function boardOf(kind: string, config: unknown): { kind: string; slug: string; url: string } | null {
  const make = BOARD_KINDS[kind]
  const slug = (config as { company?: unknown } | null)?.company
  if (!make || typeof slug !== 'string' || !SLUG.test(slug)) return null
  return { kind, slug, url: make(slug) }
}

interface Acc {
  c: CompanyCandidate
  n: number
  last: Date
}

/**
 * Postings → one candidate per employer (by domain, else name key and
 * country): regions unioned, postings counted, the board kept when the
 * posting came from the employer's own ATS source.
 */
export function employersFromPostings(rows: readonly PostingEmployer[], now: Date = new Date(), limit = MAX_JOB_EMPLOYERS): CompanyCandidate[] {
  const acc = new Map<string, Acc>()
  const recentSince = now.getTime() - 30 * 86_400_000
  const priorSince = now.getTime() - 90 * 86_400_000
  const windows = new Map<string, { r: number; p: number }>()
  for (const r of rows) {
    const t = r.createdAt.getTime()
    const name0 = employerName(r.companyName)
    if (name0 && t >= priorSince) {
      const d = domainOf(r.companyWebsite ?? (r.companyDomain ? `https://${r.companyDomain}` : undefined))
      const k = d ? `d:${d}` : `n:${nameKey(name0)}`
      const w = windows.get(k) ?? { r: 0, p: 0 }
      windows.set(k, t >= recentSince ? { ...w, r: w.r + 1 } : { ...w, p: w.p + 1 })
    }
  }
  for (const r of rows) {
    const name = employerName(r.companyName)
    if (!name) continue
    const website = r.companyWebsite ?? (r.companyDomain ? `https://${r.companyDomain}` : undefined)
    const regionIds = placesOf(r.regionIds, r.location)
    const domain = domainOf(website)
    const key = domain ? `d:${domain}` : `n:${nameKey(name)}`
    const prev = acc.get(key)
    const board = boardOf(r.sourceKind, r.sourceConfig)
    if (prev) {
      prev.n += 1
      prev.c.regionIds = deepestRegions([...prev.c.regionIds, ...regionIds])
      if (r.createdAt > prev.last) prev.last = r.createdAt
      if (board && !prev.c.board) prev.c.board = { ...board, sourceId: r.sourceId }
      continue
    }
    acc.set(key, {
      n: 1,
      last: r.createdAt,
      c: {
        name,
        website: domain ? website : undefined,
        regionIds,
        industries: [],
        sourceTags: [JOBS_TAG],
        evidence: {},
        ...(board ? { board: { ...board, sourceId: r.sourceId } } : {}),
      },
    })
  }
  return [...acc.values()]
    .sort((a, b) => b.n - a.n || b.last.getTime() - a.last.getTime())
    .slice(0, limit)
    .map(({ c, n, last }) => {
      const w = windows.get(domainOf(c.website) ? `d:${domainOf(c.website)}` : `n:${nameKey(c.name)}`) ?? { r: 0, p: 0 }
      return { ...c, evidence: { ...c.evidence, jobsSeen: n, jobsSeenAt: last.toISOString().slice(0, 10), jobsRecent30: w.r, jobsPrior60: w.p } }
    })
}

/** Watch-list and applied-to companies → candidates. */
export function employersFromTracked(rows: readonly TrackedEmployer[]): CompanyCandidate[] {
  return rows.flatMap((r): CompanyCandidate[] => {
    const name = employerName(r.name)
    if (!name) return []
    const website = r.website ?? (r.domain ? `https://${r.domain}` : undefined)
    const regionIds = deepestRegions(resolveLocation([r.city, r.country].filter(Boolean).join(', ')).places.map((p) => p.id))
    return [{ name, website: domainOf(website) ? website : undefined, regionIds, industries: [], sourceTags: [JOBS_TAG], evidence: {} }]
  })
}
