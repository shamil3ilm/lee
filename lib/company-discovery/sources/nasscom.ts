import * as cheerio from 'cheerio'
import { resolveLocation } from '@/lib/regions/normalize'
import { companyGet, CompanyHttpError, type CompanyHttpDeps } from '../http'
import type { CompanyCandidate } from '../types'

/**
 * NASSCOM member list (audited 2026-10-09; docs/job-sources.md): robots.txt
 * disallows /core/, /profiles/, /search/, /user/* … but not
 * /members-listing; no terms-of-use page; the footer's policies have no
 * clause on automated access. About 3,600 members, 15 a page (pages 0…242),
 * each with name, city and website. Only members in the user's Indian
 * target places are kept; the cursor walks the pages over several weeks.
 */

export const NASSCOM_MEMBERS = 'https://nasscom.in/members-listing'

export function parseNasscomPage(html: string): { companies: CompanyCandidate[]; lastPage: number; hasNext: boolean } {
  const $ = cheerio.load(html)
  const companies: CompanyCandidate[] = []
  $('.perspectives_card_content').each((_, el) => {
    const card = $(el)
    const name = card.find('h3.job_title').first().text().replace(/\s+/g, ' ').trim()
    if (name.length < 2) return
    const city = card.find('.category').first().text().replace(/\s+/g, ' ').trim()
    const href = card.find('.fee a[href]').first().attr('href') ?? ''
    const places = resolveLocation(city ? `${city}, India` : '').places.map((p) => p.id).filter((id) => id !== 'in')
    companies.push({
      name: name.slice(0, 200),
      website: /^https?:\/\//i.test(href) ? href : undefined,
      regionIds: places.length > 0 ? places : ['in'],
      industries: ['it_services'],
      sourceTags: ['directory:nasscom'],
      evidence: { listedAt: NASSCOM_MEMBERS },
    })
  })
  const hasNext = $('a[rel="next"]').length > 0
  return { companies, lastPage: 0, hasNext }
}

/** Page N (1-based for the cursor; NASSCOM counts from 0). The listing has no last-page link, so the next link drives it. */
export async function fetchNasscomPage(page: number, deps: CompanyHttpDeps = {}): Promise<{ items: CompanyCandidate[]; lastPage: number }> {
  const n = Math.max(1, Math.floor(page))
  const url = n === 1 ? NASSCOM_MEMBERS : `${NASSCOM_MEMBERS}?page=${n - 1}`
  const res = await companyGet('nasscom-members', url, deps, { accept: 'text/html', maxBytes: 2 * 1024 * 1024 })
  if (!res.ok) {
    void res.body?.cancel().catch(() => undefined)
    throw new CompanyHttpError('nasscom-members', res.status)
  }
  const r = parseNasscomPage(await res.text())
  return { items: r.companies, lastPage: r.hasNext ? n + 1 : n }
}
