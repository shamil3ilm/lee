import * as cheerio from 'cheerio'
import { companyGet, companyJson, CompanyHttpError, type CompanyHttpDeps } from '../http'
import type { CompanyCandidate } from '../types'

/**
 * Technopark (Thiruvananthapuram) company list (audited 2026-10-09; see
 * docs/job-sources.md): robots.txt disallows only `/cgi-bin/`, no terms
 * against reading it.
 *
 *   list     GET technopark.in/api/paginated-companies?page=N — the JSON its
 *            own /company-list page calls: 20 per page, 497 companies on
 *            25 pages (names only, no website).
 *   profile  GET technopark.in/company-details/{id} — the public profile
 *            page; its "Company Website" link is the company's own site
 *            (read during enrichment, one company at a time).
 *
 * The whole list is read in every run when time allows; an interrupted run
 * resumes at the next page (a cursor on the "Local companies" source).
 */

export const TECHNOPARK_COMPANIES = 'https://technopark.in/api/paginated-companies'
export const TECHNOPARK_PROFILE = 'https://technopark.in/company-details/'
export const TECHNOPARK_LIST_PAGE = 'https://technopark.in/company-list'

interface TechnoparkCompany {
  id?: unknown
  company?: unknown
  active?: unknown
}

export interface DirectoryPage {
  companies: CompanyCandidate[]
  /** Last page number the listing reports (1 when unknown). */
  lastPage: number
}

/** The public profile URL of a Technopark company id, or undefined for a malformed id. */
export function technoparkProfileUrl(id: unknown): string | undefined {
  const n = typeof id === 'number' ? id : typeof id === 'string' && /^\d{1,9}$/.test(id) ? Number(id) : NaN
  return Number.isInteger(n) && n > 0 ? `${TECHNOPARK_PROFILE}${n}` : undefined
}

export function parseTechnoparkCompanies(body: unknown): DirectoryPage {
  const b = (body ?? {}) as { data?: unknown; last_page?: unknown }
  const rows = (Array.isArray(b.data) ? b.data : []) as TechnoparkCompany[]
  const companies = rows.flatMap((r): CompanyCandidate[] => {
    const name = typeof r.company === 'string' ? r.company.replace(/\s+/g, ' ').trim() : ''
    if (!name || r.active === 0) return []
    const profile = technoparkProfileUrl(r.id)
    return [
      {
        name,
        regionIds: ['thiruvananthapuram'],
        industries: ['it_services'],
        sourceTags: ['directory:technopark'],
        evidence: { listedAt: profile ?? TECHNOPARK_LIST_PAGE, ...(profile ? { profileUrl: profile } : {}) },
      },
    ]
  })
  const last = typeof b.last_page === 'number' && Number.isInteger(b.last_page) ? b.last_page : 1
  return { companies, lastPage: Math.max(1, Math.min(200, last)) }
}

export async function fetchTechnoparkPage(page: number, deps: CompanyHttpDeps = {}): Promise<DirectoryPage> {
  const url = `${TECHNOPARK_COMPANIES}?page=${Math.max(1, Math.floor(page))}&search=&location=&building=&alphabet=`
  return parseTechnoparkCompanies(await companyJson('technopark-companies', url, deps))
}

/** The "Company Website" link of a Technopark profile page, or null. */
export function parseTechnoparkProfile(html: string): string | null {
  const $ = cheerio.load(html)
  const link = $('a[aria-label="Company Website"]').first().attr('href') ?? ''
  return /^https?:\/\/[^\s"'<>]+$/i.test(link.trim()) ? link.trim() : null
}

/** Profile pages lee reads: only Technopark's (see the robots and terms check above). */
export function isParkProfileUrl(url: string): boolean {
  return url.startsWith(TECHNOPARK_PROFILE) && /^\d{1,9}$/.test(url.slice(TECHNOPARK_PROFILE.length))
}

export async function fetchParkProfileWebsite(url: string, deps: CompanyHttpDeps = {}): Promise<string | null> {
  if (!isParkProfileUrl(url)) return null
  const res = await companyGet('technopark-profile', url, deps, { accept: 'text/html', maxBytes: 1024 * 1024 })
  if (!res.ok) {
    void res.body?.cancel().catch(() => undefined)
    throw new CompanyHttpError('technopark-profile', res.status)
  }
  return parseTechnoparkProfile(await res.text())
}
