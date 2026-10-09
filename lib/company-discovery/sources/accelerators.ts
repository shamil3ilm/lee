import * as cheerio from 'cheerio'
import { companyGet, CompanyHttpError, type CompanyHttpDeps } from '../http'
import type { CompanyCandidate } from '../types'

/**
 * Accelerator and ecosystem lists (audited 2026-10-09; docs/job-sources.md).
 * Both: robots.txt `User-agent: * Allow: /`, no terms page, no bot wall.
 *
 *   flat6labs        GET flat6labs.com/company-sitemap.xml (Yoast; 455
 *                    portfolio companies across /Company/, /fr/Company/,
 *                    /ar/Company/), then each company page: name and
 *                    country in its <h1>, website after "Website". Only GCC
 *                    companies are kept. 20 pages per cursor step.
 *   startup-bahrain  GET startupbahrain.com/ecosystem (one pre-rendered Framer
 *                    page): the "Startups" section's cards, name + domain.
 */

export const FLAT6LABS_SITEMAP = 'https://flat6labs.com/company-sitemap.xml'
export const STARTUP_BAHRAIN = 'https://startupbahrain.com/ecosystem'
/** Company pages read per cursor step. */
export const FLAT6LABS_PER_PAGE = 20

const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/

async function getText(label: string, url: string, deps: CompanyHttpDeps, accept: string): Promise<string> {
  const res = await companyGet(label, url, deps, { accept, maxBytes: 3 * 1024 * 1024 })
  if (!res.ok) {
    void res.body?.cancel().catch(() => undefined)
    throw new CompanyHttpError(label, res.status)
  }
  return res.text()
}

/** Sitemap → one company page URL per slug (English first, then French, then Arabic). */
export function parseFlat6labsSitemap(xml: string): string[] {
  const bySlug = new Map<string, { url: string; rank: number }>()
  for (const m of xml.matchAll(/<loc>\s*(https:\/\/flat6labs\.com\/(?:(fr|ar)\/)?Company\/([^/<\s]+)\/)\s*<\/loc>/g)) {
    const slug = decodeURIComponent(m[3] ?? '').toLowerCase()
    if (!SLUG.test(slug)) continue
    const rank = m[2] === 'fr' ? 1 : m[2] === 'ar' ? 2 : 0
    const prev = bySlug.get(slug)
    if (!prev || rank < prev.rank) bySlug.set(slug, { url: m[1]!, rank })
  }
  return [...bySlug.keys()].sort().map((s) => bySlug.get(s)!.url)
}

/** Country words on Flat6Labs pages (English, French, Arabic) → region ids; other countries → null. */
const COUNTRIES: ReadonlyArray<readonly [RegExp, string]> = [
  [/(?<!\p{L})(ksa|saudi|arabie saoudite)(?!\p{L})|السعودية/iu, 'sa'],
  [/(?<!\p{L})(uae|emirates|émirats|emirats)(?!\p{L})|الإمارات/iu, 'ae'],
  [/(?<!\p{L})(bahrain|bahreïn|bahrein)(?!\p{L})|البحرين/iu, 'bh'],
  [/(?<!\p{L})oman(?!\p{L})|عمان/iu, 'om'],
  [/(?<!\p{L})qatar(?!\p{L})|قطر/iu, 'qa'],
  [/(?<!\p{L})(kuwait|koweït)(?!\p{L})|الكويت/iu, 'kw'],
]

export function countryRegion(text: string): string | null {
  return COUNTRIES.find(([re]) => re.test(text))?.[1] ?? null
}

/** A Flat6Labs company page → a GCC candidate (null for other countries or an unreadable page). */
export function parseFlat6labsCompany(html: string, pageUrl: string): CompanyCandidate | null {
  const $ = cheerio.load(html)
  const h1 = $('.widget-con h1').first()
  const country = h1.find('strong').text().trim()
  const name = h1.clone().children().remove().end().text().replace(/\s+/g, ' ').trim()
  const region = countryRegion(country)
  if (name.length < 2 || !region) return null
  let website: string | undefined
  $('ul.logos li').each((_, li) => {
    if (website || !/website|site web|الموقع/i.test($(li).find('span').first().text())) return
    const href = $(li).find('a[href]').first().attr('href') ?? ''
    if (/^https?:\/\//i.test(href)) website = href
  })
  return { name: name.slice(0, 200), website, regionIds: [region], industries: [], sourceTags: ['directory:flat6labs'], evidence: { listedAt: pageUrl } }
}

/**
 * One cursor step: the sitemap, then FLAT6LABS_PER_PAGE company pages from
 * `page`. Pages that fail are skipped (the step still counts).
 */
export async function fetchFlat6labsPage(page: number, deps: CompanyHttpDeps = {}): Promise<{ items: CompanyCandidate[]; lastPage: number }> {
  const urls = parseFlat6labsSitemap(await getText('flat6labs-sitemap', FLAT6LABS_SITEMAP, deps, 'application/xml'))
  const lastPage = Math.max(1, Math.ceil(urls.length / FLAT6LABS_PER_PAGE))
  const start = (Math.min(Math.max(1, page), lastPage) - 1) * FLAT6LABS_PER_PAGE
  const items: CompanyCandidate[] = []
  for (const url of urls.slice(start, start + FLAT6LABS_PER_PAGE)) {
    try {
      const c = parseFlat6labsCompany(await getText('flat6labs-company', url, deps, 'text/html'), url)
      if (c) items.push(c)
    } catch {
      // one missing page does not stop the step
    }
  }
  return { items, lastPage }
}

const NOT_A_COMPANY = /submit|database|add your/i

/** The ecosystem page's "Startups" cards (name + domain), deduped. */
export function parseStartupBahrain(html: string): CompanyCandidate[] {
  const start = html.indexOf('>Startups<')
  const end = start >= 0 ? html.indexOf('>Enablers<', start) : -1
  const $ = cheerio.load(start >= 0 ? html.slice(start, end > start ? end : undefined) : html)
  const seen = new Set<string>()
  const out: CompanyCandidate[] = []
  $('a[href]').each((_, el) => {
    const a = $(el)
    const name = a.find('strong').first().text().replace(/\s+/g, ' ').trim()
    const href = a.attr('href') ?? ''
    if (name.length < 2 || NOT_A_COMPANY.test(name) || !/^https?:\/\//i.test(href) || seen.has(name.toLowerCase())) return
    seen.add(name.toLowerCase())
    out.push({ name, website: href, regionIds: ['bh'], industries: [], sourceTags: ['directory:startup-bahrain'], evidence: { listedAt: STARTUP_BAHRAIN } })
  })
  return out
}

export async function fetchStartupBahrain(deps: CompanyHttpDeps = {}): Promise<CompanyCandidate[]> {
  return parseStartupBahrain(await getText('startup-bahrain', STARTUP_BAHRAIN, deps, 'text/html'))
}
