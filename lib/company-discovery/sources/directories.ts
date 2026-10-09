import * as cheerio from 'cheerio'
import { companyJson, type CompanyHttpDeps } from '../http'
import { industriesFromText } from '../industry'
import type { CompanyCandidate } from '../types'

/**
 * Startup, free-zone and IT-park company directories (audited 2026-10-09;
 * docs/job-sources.md has each one's robots.txt and terms). Two are read
 * automatically because robots.txt allows the endpoint the site's own page
 * calls and no terms forbid it:
 *
 *   technopark  GET technopark.in/api/paginated-companies?page=N (JSON,
 *               20 per page; names only — no website in the listing)
 *   qstp        GET qstp.qa/wp-json/wp/v2/directory?per_page=100 (the WordPress
 *               REST API of Qatar Science & Technology Park's directory)
 *
 * Everything else is a browse link (./browse.ts): its terms forbid
 * automated reading, it sits behind a bot wall, or it has no list.
 */

export const TECHNOPARK_COMPANIES = 'https://technopark.in/api/paginated-companies'
export const QSTP_DIRECTORY = 'https://qstp.qa/wp-json/wp/v2/directory'
/** Technopark pages read per run (20 companies each); they rotate weekly. */
export const TECHNOPARK_PAGES_PER_RUN = 3

interface TechnoparkCompany {
  id?: unknown
  company?: unknown
  active?: unknown
}

export function parseTechnoparkCompanies(body: unknown): { companies: CompanyCandidate[]; lastPage: number } {
  const b = (body ?? {}) as { data?: unknown; last_page?: unknown }
  const rows = (Array.isArray(b.data) ? b.data : []) as TechnoparkCompany[]
  const companies = rows.flatMap((r): CompanyCandidate[] => {
    const name = typeof r.company === 'string' ? r.company.replace(/\s+/g, ' ').trim() : ''
    if (!name || r.active === 0) return []
    return [
      {
        name,
        regionIds: ['thiruvananthapuram'],
        industries: ['it_services'],
        sourceTags: ['directory:technopark'],
        evidence: { listedAt: 'https://technopark.in/company-list' },
      },
    ]
  })
  return { companies, lastPage: typeof b.last_page === 'number' ? b.last_page : 1 }
}

export async function fetchTechnopark(pages: readonly number[], deps: CompanyHttpDeps = {}): Promise<CompanyCandidate[]> {
  const out: CompanyCandidate[] = []
  for (const page of pages) {
    const url = `${TECHNOPARK_COMPANIES}?page=${Math.max(1, Math.floor(page))}&search=&location=&building=&alphabet=`
    out.push(...parseTechnoparkCompanies(await companyJson('technopark-companies', url, deps)).companies)
  }
  return out
}

interface WpDirectoryEntry {
  title?: { rendered?: unknown }
  content?: { rendered?: unknown }
  link?: unknown
  class_list?: unknown
}

function decode(html: string): string {
  return cheerio.load(`<p>${html}</p>`)('p').text().replace(/\s+/g, ' ').trim()
}

/** QSTP directory entries → candidates in Doha (website from the entry's "Website:" link). */
export function parseQstpDirectory(body: unknown): CompanyCandidate[] {
  const rows = (Array.isArray(body) ? body : []) as WpDirectoryEntry[]
  return rows.flatMap((r): CompanyCandidate[] => {
    const name = typeof r.title?.rendered === 'string' ? decode(r.title.rendered) : ''
    if (!name) return []
    const html = typeof r.content?.rendered === 'string' ? r.content.rendered : ''
    const $ = cheerio.load(html)
    let website: string | undefined
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') ?? ''
      const label = $(el).parent().text()
      if (!website && /^https?:\/\//.test(href) && /website/i.test(label)) website = href.split('?')[0]
    })
    const text = $.root().text().replace(/\s+/g, ' ').trim()
    const sector = /Sector:\s*([^\n]+?)(?:Get in touch|Website:|$)/i.exec(text)?.[1] ?? ''
    const tags = Array.isArray(r.class_list) ? r.class_list.filter((c): c is string => typeof c === 'string' && c.startsWith('tag-')).join(' ') : ''
    return [
      {
        name,
        website,
        regionIds: ['doha'],
        industries: industriesFromText(`${sector} ${tags.replace(/tag-|-/g, ' ')}`),
        sourceTags: ['directory:qstp'],
        evidence: {
          description: text.slice(0, 200),
          ...(typeof r.link === 'string' && r.link.startsWith('https://qstp.qa/') ? { listedAt: r.link } : {}),
        },
      },
    ]
  })
}

export async function fetchQstp(deps: CompanyHttpDeps = {}): Promise<CompanyCandidate[]> {
  return parseQstpDirectory(await companyJson('qstp-directory', `${QSTP_DIRECTORY}?per_page=100`, deps, { maxBytes: 4 * 1024 * 1024 }))
}
