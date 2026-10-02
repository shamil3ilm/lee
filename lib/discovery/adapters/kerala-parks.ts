import * as cheerio from 'cheerio'
import type { DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'
import { discoveryFetch } from './http'
import { toDate } from './prefs'

/**
 * Kerala IT-park job portals. Checked 2026-09-27: every one is public, has
 * no login, and robots.txt allows the listing path; none has terms that
 * forbid automated access. lee reads each once a day with its honest
 * User-Agent and a small page cap, and links every job back to the park's
 * own page.
 *
 *   technopark   JSON  technopark.in/api/paginated-jobs (the page's own API)
 *   infopark     HTML  infopark.in/companies-job (table)
 *   cyberpark    JSON  cyberparks.in/jm-ajax/get_listings (WP Job Manager, HTML inside)
 *   ul_cyberpark HTML  ulcyberpark.com/jobs (table)
 *   ksum         JSON  startupmission.kerala.gov.in/api/public/career (KSUM's own openings)
 *
 * A page whose layout changed throws a clear "<portal>: … not found" error,
 * so the source shows it in Settings and the normal error count / skip
 * after repeated failures applies.
 */

export class PortalLayoutError extends Error {
  constructor(portal: string, what: string) {
    super(`${portal}: ${what} not found — the page layout may have changed`)
    this.name = 'PortalLayoutError'
  }
}

function clean(s: string | undefined | null): string {
  return (s ?? '').replace(/\s+/g, ' ').trim()
}

/** "27-09-2026" → Date (UTC midnight). */
export function parseDmy(s: string | undefined): Date | undefined {
  const m = (s ?? '').match(/(\d{1,2})-(\d{1,2})-(\d{4})/)
  if (!m) return undefined
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])))
  return Number.isNaN(d.getTime()) ? undefined : d
}

function job(fields: {
  id: string
  title: string
  company: string
  location: string
  url: string
  postedAt?: Date
  closingAt?: Date
  park: string
  raw: Record<string, unknown>
}): DiscoveryItem {
  const raw = { ...fields.raw, closing: fields.closingAt?.toISOString() }
  const normalized: NormalizedJob = {
    kind: 'job',
    title: fields.title,
    companyName: fields.company || 'Unknown company',
    location: fields.location,
    remoteType: 'onsite',
    employmentType: 'unknown',
    descriptionMd: fields.closingAt ? `Apply by ${fields.closingAt.toISOString().slice(0, 10)}.` : '',
    applyUrl: fields.url,
    postedAt: fields.postedAt,
    techStack: [],
    subSource: fields.park,
    tags: [`park:${fields.park}`, 'country:in'],
    raw,
  }
  return { sourceItemId: fields.id, raw, normalized }
}

async function getText(label: string, url: string, accept = 'text/html'): Promise<string> {
  const res = await discoveryFetch(label, url, { headers: { accept } })
  if (!res.ok) throw new Error(`${label} ${res.status}`)
  return res.text()
}

async function getJson<T>(label: string, url: string): Promise<T> {
  const text = await getText(label, url, 'application/json')
  try {
    return JSON.parse(text) as T
  } catch {
    throw new PortalLayoutError(label, 'JSON response')
  }
}

// ---------------------------------------------------------------------------
// Technopark (Trivandrum)
// ---------------------------------------------------------------------------

interface TechnoparkJob {
  id?: number
  job_listing_id?: string
  job_title?: string
  posted_date?: string
  closing_date?: string
  is_walk_in?: number
  walk_in_start_date?: string | null
  company?: { company?: string }
}
interface TechnoparkPage {
  data?: TechnoparkJob[]
  last_page?: number
}

export function parseTechnopark(page: TechnoparkPage): DiscoveryItem[] {
  if (!Array.isArray(page.data)) throw new PortalLayoutError('technopark', 'job list (data[])')
  return page.data.flatMap((j) => {
    if (!j.id || !j.job_title) return []
    const walkIn = j.is_walk_in === 1 && j.walk_in_start_date ? ` (walk-in ${j.walk_in_start_date})` : ''
    return [
      job({
        id: String(j.id),
        title: clean(j.job_title) + walkIn,
        company: clean(j.company?.company),
        location: 'Technopark, Thiruvananthapuram, Kerala, India',
        url: `https://technopark.in/job-details/${j.id}`,
        postedAt: toDate(j.posted_date),
        closingAt: toDate(j.closing_date),
        park: 'technopark',
        raw: { id: j.id, job_listing_id: j.job_listing_id, title: j.job_title, company: j.company?.company, posted: j.posted_date },
      }),
    ]
  })
}

export class TechnoparkAdapter implements DiscoveryAdapter {
  readonly kind = 'technopark'
  static readonly MAX_PAGES = 5

  async fetch(): Promise<DiscoveryItem[]> {
    const items: DiscoveryItem[] = []
    for (let p = 1; p <= TechnoparkAdapter.MAX_PAGES; p++) {
      const page = await getJson<TechnoparkPage>('technopark', `https://technopark.in/api/paginated-jobs?page=${p}`)
      items.push(...parseTechnopark(page))
      if (!page.last_page || p >= page.last_page) break
    }
    return items
  }
}

// ---------------------------------------------------------------------------
// Infopark (Kochi)
// ---------------------------------------------------------------------------

export function parseInfopark(html: string): DiscoveryItem[] {
  const $ = cheerio.load(html)
  const table = $('#job-list table')
  if (table.length === 0) throw new PortalLayoutError('infopark', 'job table (#job-list table)')
  const items: DiscoveryItem[] = []
  table.find('tbody tr').each((_, tr) => {
    const tds = $(tr).find('td')
    const href = $(tr).find('td.btn-sec a[href]').attr('href') ?? ''
    const id = href.match(/\/company-jobs\/details\/(\d+)\/(\d+)/)
    const title = clean(tds.eq(1).text())
    if (!id || !title) return
    items.push(
      job({
        id: id[2]!,
        title,
        company: clean(tds.eq(2).text()),
        location: 'Infopark, Kochi, Kerala, India',
        url: `https://infopark.in/company-jobs/details/${id[1]}/${id[2]}`,
        postedAt: parseDmy(clean(tds.eq(0).text())),
        closingAt: toDate(clean(tds.eq(3).text())),
        park: 'infopark',
        raw: { id: id[2], companyId: id[1], title, company: clean(tds.eq(2).text()), posted: clean(tds.eq(0).text()) },
      }),
    )
  })
  return items
}

export class InfoparkAdapter implements DiscoveryAdapter {
  readonly kind = 'infopark'
  /** Newest postings come first; 3 pages ≈ the last 60 jobs. */
  static readonly MAX_PAGES = 3

  async fetch(): Promise<DiscoveryItem[]> {
    const items: DiscoveryItem[] = []
    for (let p = 1; p <= InfoparkAdapter.MAX_PAGES; p++) {
      const page = parseInfopark(await getText('infopark', `https://infopark.in/companies-job?page=${p}`))
      items.push(...page)
      if (page.length < 20) break
    }
    return items
  }
}

// ---------------------------------------------------------------------------
// Kerala Cyberpark (Kozhikode) — WP Job Manager
// ---------------------------------------------------------------------------

interface WpJobManagerPage {
  html?: string
  max_num_pages?: number
}

export function parseCyberpark(page: WpJobManagerPage): DiscoveryItem[] {
  if (typeof page.html !== 'string') throw new PortalLayoutError('cyberpark', 'listings HTML')
  const $ = cheerio.load(page.html)
  const items: DiscoveryItem[] = []
  $('li.job_listing').each((_, li) => {
    const $li = $(li)
    const id = ($li.attr('class') ?? '').match(/\bpost-(\d+)\b/)?.[1]
    const url = $li.find('> a[href]').attr('href') ?? ''
    const title = clean($li.find('.position h3').text())
    if (!id || !title || !/^https:\/\/cyberparks\.in\//.test(url)) return
    const where = clean($li.find('.location').text())
    items.push(
      job({
        id,
        title,
        company: clean($li.find('.company strong').text()),
        location: `${where || 'Cyberpark'}, Kozhikode, Kerala, India`.replace(/(Kozhikode|Calicut), Kozhikode/, '$1'),
        url,
        postedAt: toDate($li.find('li.date time').attr('datetime')),
        park: 'cyberpark',
        raw: { id, title, company: clean($li.find('.company strong').text()), location: where },
      }),
    )
  })
  return items
}

export class CyberparkAdapter implements DiscoveryAdapter {
  readonly kind = 'cyberpark'
  static readonly MAX_PAGES = 3

  async fetch(): Promise<DiscoveryItem[]> {
    const items: DiscoveryItem[] = []
    for (let p = 1; p <= CyberparkAdapter.MAX_PAGES; p++) {
      const page = await getJson<WpJobManagerPage>(
        'cyberpark',
        `https://cyberparks.in/jm-ajax/get_listings/?per_page=25&orderby=date&order=DESC&page=${p}`,
      )
      items.push(...parseCyberpark(page))
      if (!page.max_num_pages || p >= page.max_num_pages) break
    }
    return items
  }
}

// ---------------------------------------------------------------------------
// UL Cyberpark (Kozhikode)
// ---------------------------------------------------------------------------

export function parseUlCyberpark(html: string): DiscoveryItem[] {
  const $ = cheerio.load(html)
  const table = $('.table-job table')
  if (table.length === 0) throw new PortalLayoutError('ul_cyberpark', 'job table (.table-job table)')
  const items: DiscoveryItem[] = []
  table.find('tr').each((_, tr) => {
    const tds = $(tr).find('td')
    const href = tds.eq(2).find('a[href]').attr('href') ?? ''
    const id = href.match(/job_vacancy\?job_id=(\d+)/)?.[1]
    const title = clean(tds.eq(0).find('a').first().text())
    if (!id || !title) return
    // The company cell links to a broken "http://hr@company" pseudo-URL; only its text is used.
    const company = clean(tds.eq(1).text())
    items.push(
      job({
        id,
        title,
        company,
        location: 'UL Cyberpark, Kozhikode, Kerala, India',
        url: `https://www.ulcyberpark.com/jobs/job_vacancy?job_id=${id}`,
        closingAt: parseDmy(tds.eq(0).find('span').text()),
        park: 'ul_cyberpark',
        raw: { id, title, company },
      }),
    )
  })
  return items
}

export class UlCyberparkAdapter implements DiscoveryAdapter {
  readonly kind = 'ul_cyberpark'
  static readonly MAX_PAGES = 4

  async fetch(): Promise<DiscoveryItem[]> {
    const items: DiscoveryItem[] = []
    for (let p = 0; p < UlCyberparkAdapter.MAX_PAGES; p++) {
      const url = p === 0 ? 'https://www.ulcyberpark.com/jobs' : `https://www.ulcyberpark.com/jobs/index/${p * 10}`
      const page = parseUlCyberpark(await getText('ul_cyberpark', url))
      items.push(...page)
      if (page.length < 10) break
    }
    return items
  }
}

// ---------------------------------------------------------------------------
// KSUM (Kerala Startup Mission) — its own openings
// ---------------------------------------------------------------------------

interface KsumItem {
  name?: string
  slug?: string
  closing?: string
  category?: string
  status?: string
}
interface KsumPage {
  data?: KsumItem[]
  next_page_url?: string | null
}

export function parseKsum(page: KsumPage): DiscoveryItem[] {
  if (!Array.isArray(page.data)) throw new PortalLayoutError('ksum', 'career list (data[])')
  return page.data.flatMap((c) => {
    if (!c.slug || !c.name || (c.status && c.status !== 'active')) return []
    if (!/^[a-z0-9-]+$/i.test(c.slug)) return []
    return [
      job({
        id: c.slug,
        title: c.category && c.category !== 'KSUM Staff' ? `${clean(c.name)} (${c.category})` : clean(c.name),
        company: 'Kerala Startup Mission',
        location: 'Kerala, India',
        url: `https://startupmission.kerala.gov.in/career/${c.slug}`,
        closingAt: toDate(c.closing?.replace(/\s+\d{1,2}:\d{2}\s*[AP]M$/i, '')),
        park: 'ksum',
        raw: { slug: c.slug, name: c.name, category: c.category, closing: c.closing },
      }),
    ]
  })
}

export class KsumAdapter implements DiscoveryAdapter {
  readonly kind = 'ksum'
  static readonly MAX_PAGES = 3

  async fetch(): Promise<DiscoveryItem[]> {
    const items: DiscoveryItem[] = []
    for (let p = 1; p <= KsumAdapter.MAX_PAGES; p++) {
      const page = await getJson<KsumPage>('ksum', `https://startupmission.kerala.gov.in/api/public/career?page=${p}`)
      items.push(...parseKsum(page))
      if (!page.next_page_url) break
    }
    return items
  }
}
