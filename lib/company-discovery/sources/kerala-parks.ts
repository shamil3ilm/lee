import * as cheerio from 'cheerio'
import { companyGet, CompanyHttpError, type CompanyHttpDeps } from '../http'
import { industriesFromText } from '../industry'
import type { CompanyCandidate } from '../types'
import type { DirectoryPage } from './technopark'

/**
 * Company lists of the other Kerala IT parks (audited 2026-10-09; see
 * docs/job-sources.md). All public HTML, no login; robots.txt allows the
 * pages and no terms forbid reading them:
 *
 *   infopark     GET infopark.in/companies?page=N (42 cards a page, 10 pages,
 *                401 companies): name, website, "Domain" tags. Kochi.
 *                robots.txt `Disallow:` (empty); no terms page.
 *   cyberpark    GET cyberparks.in/companies-at-park/ (one page, ~76 cards):
 *                name, website, listing link. Kozhikode. robots.txt disallows
 *                only /wp-admin/; no terms page.
 *   ul-cyberpark GET www.ulcyberpark.com/companies (one page, ~45 cards):
 *                name, website. Kozhikode. No robots.txt (the path serves the
 *                site's 404 page); its terms have no clause on automated access.
 *
 * Parsers read the card markup by class names and fall back to nothing (an
 * empty page) when the markup changes, so a redesign never invents
 * companies. Contact e-mails and phone numbers on the cards are never kept.
 */

export const INFOPARK_COMPANIES = 'https://infopark.in/companies'
export const CYBERPARK_COMPANIES = 'https://cyberparks.in/companies-at-park/'
export const UL_CYBERPARK_COMPANIES = 'https://www.ulcyberpark.com/companies'

const MAX_PAGES = 60

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/[\s.,]+$/, '').trim()
}

/** "www.acme.example" or a full link to it → an https URL, or undefined for anything that is not a host. */
export function siteUrl(raw: string | undefined): string | undefined {
  const t = (raw ?? '').trim().replace(/^https?:\/\//i, '').split(/[\s/?#]/)[0] ?? ''
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(t) ? `https://${t.toLowerCase()}` : undefined
}

function candidate(name: string, website: string | undefined, regionId: string, tag: string, listedAt: string, industryText = ''): CompanyCandidate {
  const industries = industriesFromText(industryText)
  return {
    name,
    website,
    regionIds: [regionId],
    industries: industries.length > 0 ? industries : ['it_services'],
    sourceTags: [`directory:${tag}`],
    evidence: { listedAt },
  }
}

/** The highest `?page=N` a listing links to (1 when there is none). */
function lastPageOf($: cheerio.CheerioAPI, base: string): number {
  let last = 1
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? ''
    if (!href.startsWith(base)) return
    const m = /[?&]page=(\d{1,3})\b/.exec(href)
    if (m) last = Math.max(last, Number(m[1]))
  })
  return Math.min(MAX_PAGES, last)
}

export function parseInfoparkPage(html: string): DirectoryPage {
  const $ = cheerio.load(html)
  const companies: CompanyCandidate[] = []
  $('.compy').each((_, el) => {
    const card = $(el)
    const name = clean(card.find('h5').first().text())
    if (name.length < 2) return
    const website = siteUrl(card.find('.web').first().text())
    const domains = card.find('.domain-items span').map((__, s) => $(s).text()).get().join(' · ')
    const profile = card.find('a[href^="https://infopark.in/companies-profile/"]').first().attr('href')
    companies.push(candidate(name, website, 'kochi', 'infopark', profile ?? INFOPARK_COMPANIES, domains))
  })
  return { companies, lastPage: lastPageOf($, INFOPARK_COMPANIES) }
}

export function parseCyberparkPage(html: string): DirectoryPage {
  const $ = cheerio.load(html)
  const companies: CompanyCandidate[] = []
  $('.cmpny-detail').each((_, el) => {
    const card = $(el)
    const name = clean(card.find('.comp_name').first().text())
    if (name.length < 2) return
    const website = siteUrl(card.find('.comp_web a').first().attr('href'))
    const listing = card.find('a[href^="https://cyberparks.in/listings/"]').first().attr('href')
    companies.push(candidate(name, website, 'kozhikode', 'cyberpark', listing ?? CYBERPARK_COMPANIES))
  })
  return { companies, lastPage: 1 }
}

export function parseUlCyberparkPage(html: string): DirectoryPage {
  const $ = cheerio.load(html)
  const companies: CompanyCandidate[] = []
  $('a.com_link').each((_, el) => {
    const card = $(el)
    const name = clean(card.find('.card-title').first().text())
    if (name.length < 2) return
    companies.push(candidate(name, siteUrl(card.attr('href')), 'kozhikode', 'ul-cyberpark', UL_CYBERPARK_COMPANIES))
  })
  return { companies, lastPage: 1 }
}

async function getHtml(label: string, url: string, deps: CompanyHttpDeps): Promise<string> {
  const res = await companyGet(label, url, deps, { accept: 'text/html', maxBytes: 3 * 1024 * 1024 })
  if (!res.ok) {
    void res.body?.cancel().catch(() => undefined)
    throw new CompanyHttpError(label, res.status)
  }
  return res.text()
}

export async function fetchInfoparkPage(page: number, deps: CompanyHttpDeps = {}): Promise<DirectoryPage> {
  const n = Math.max(1, Math.floor(page))
  return parseInfoparkPage(await getHtml('infopark-companies', n === 1 ? INFOPARK_COMPANIES : `${INFOPARK_COMPANIES}?page=${n}`, deps))
}

export async function fetchCyberpark(deps: CompanyHttpDeps = {}): Promise<DirectoryPage> {
  return parseCyberparkPage(await getHtml('cyberpark-companies', CYBERPARK_COMPANIES, deps))
}

export async function fetchUlCyberpark(deps: CompanyHttpDeps = {}): Promise<DirectoryPage> {
  return parseUlCyberparkPage(await getHtml('ul-cyberpark-companies', UL_CYBERPARK_COMPANIES, deps))
}
