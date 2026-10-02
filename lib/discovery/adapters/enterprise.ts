import { z } from 'zod'
import { XMLParser } from 'fast-xml-parser'
import type { AdapterContext, DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'
import { discoveryFetch } from './http'
import { searchPrefsFor, toDate } from './prefs'
import { locationMatchesCountries } from '../search-prefs'

/**
 * Enterprise career-site backends used by GCC employers and MNCs. Each reads
 * the public endpoint the employer's own careers page calls; all were
 * checked live on 2026-09-27 (see docs/job-sources.md):
 *
 *   oracle_orc       Oracle Recruiting Cloud  GET {host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions
 *                    (no robots.txt on *.oraclecloud.com hosts)
 *   successfactors   SAP SuccessFactors RMK   GET {host}/sitemal.xml — the site's own job feed (RSS + g:)
 *                    (robots.txt disallows /services/, not /sitemal.xml)
 *   phenom           Phenom People            POST {host}/widgets (refineSearch)
 *                    (robots.txt disallows /px-widgets, /apply …, not /widgets)
 *
 * Big employers list jobs worldwide; postings outside the target countries
 * are dropped here only when the backend reports a machine-readable
 * country, so the relevance layer sees fewer irrelevant rows.
 */

const HOST_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i

/** Only a plain public hostname is accepted as config (no path, port or IP). */
export function safeHost(host: string, allowed?: RegExp): string {
  const h = host.trim().toLowerCase()
  if (!HOST_RE.test(h) || /^\d+\.\d+\.\d+\.\d+$/.test(h)) throw new Error(`invalid host: ${host}`)
  if (allowed && !allowed.test(h)) throw new Error(`host not allowed for this source kind: ${host}`)
  return h
}

function clean(s: unknown): string {
  return typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : ''
}

// ---------------------------------------------------------------------------
// Oracle Recruiting Cloud
// ---------------------------------------------------------------------------

const orcConfig = z.object({
  host: z.string(),
  siteNumber: z.string().regex(/^[A-Za-z0-9_]{1,40}$/),
  displayName: z.string().max(100),
})

interface OrcRequisition {
  Id?: string
  Title?: string
  PostedDate?: string
  PostingEndDate?: string | null
  PrimaryLocation?: string
  PrimaryLocationCountry?: string
  WorkplaceType?: string
  ShortDescriptionStr?: string
}

interface OrcResponse {
  items?: Array<{ TotalJobsCount?: number; requisitionList?: OrcRequisition[] }>
}

const ORC_PAGE = 100
const ORC_MAX_PAGES = 5
/** ORC hosts answer slowly (30–90 s seen); the default 15 s would fail. */
const ORC_TIMEOUT_MS = 90_000

export function normalizeOrc(r: OrcRequisition, host: string, siteNumber: string, companyName: string): DiscoveryItem | null {
  if (!r.Id || !r.Title) return null
  const workplace = (r.WorkplaceType ?? '').toLowerCase()
  const raw = { Id: r.Id, Title: r.Title, PostedDate: r.PostedDate, PrimaryLocation: r.PrimaryLocation, PrimaryLocationCountry: r.PrimaryLocationCountry }
  const normalized: NormalizedJob = {
    kind: 'job',
    title: clean(r.Title),
    companyName,
    location: clean(r.PrimaryLocation) || undefined,
    remoteType: workplace.includes('remote') ? 'remote' : workplace.includes('hybrid') ? 'hybrid' : 'unknown',
    employmentType: 'unknown',
    descriptionMd: clean(r.ShortDescriptionStr),
    applyUrl: `https://${host}/hcmUI/CandidateExperience/en/sites/${siteNumber}/job/${encodeURIComponent(r.Id)}`,
    postedAt: toDate(r.PostedDate),
    techStack: [],
    tags: ['ats:oracle_orc', ...(r.PrimaryLocationCountry ? [`country:${r.PrimaryLocationCountry.toLowerCase()}`] : [])],
    raw,
  }
  return { sourceItemId: r.Id, raw, normalized }
}

export class OracleOrcAdapter implements DiscoveryAdapter {
  readonly kind = 'oracle_orc'

  async fetch(config: unknown, ctx?: AdapterContext): Promise<DiscoveryItem[]> {
    const cfg = orcConfig.parse(config)
    const host = safeHost(cfg.host, /\.oraclecloud\d*\.com$/)
    const prefs = await searchPrefsFor(config, ctx)
    const wanted = new Set(prefs.countries)
    const items: DiscoveryItem[] = []
    for (let page = 0; page < ORC_MAX_PAGES; page++) {
      const finder = `findReqs;siteNumber=${cfg.siteNumber},limit=${ORC_PAGE},offset=${page * ORC_PAGE},sortBy=POSTING_DATES_DESC`
      const url = `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList&finder=${encodeURIComponent(finder)}`
      const res = await discoveryFetch('oracle_orc', url, { headers: { accept: 'application/json' } }, ORC_TIMEOUT_MS)
      if (!res.ok) throw new Error(`oracle_orc ${res.status}`)
      const body = (await res.json()) as OrcResponse
      const block = body.items?.[0]
      if (!block) throw new Error('oracle_orc: unexpected response (no items)')
      const list = block.requisitionList ?? []
      for (const r of list) {
        if (r.PrimaryLocationCountry && wanted.size > 0 && !wanted.has(r.PrimaryLocationCountry.toUpperCase())) continue
        const item = normalizeOrc(r, host, cfg.siteNumber, cfg.displayName)
        if (item) items.push(item)
      }
      if (list.length < ORC_PAGE || (page + 1) * ORC_PAGE >= (block.TotalJobsCount ?? 0)) break
    }
    return items
  }
}

// ---------------------------------------------------------------------------
// SAP SuccessFactors career sites (RMK) — /sitemal.xml job feed
// ---------------------------------------------------------------------------

const sfConfig = z.object({ host: z.string(), displayName: z.string().max(100) })

interface SfItem {
  title?: string
  link?: string
  guid?: string | { '#text'?: string }
  'g:id'?: string | number
  'g:location'?: string
  'g:employer'?: string
  'g:expiration_date'?: string
  'g:job_function'?: string
}

const xml = new XMLParser({ ignoreAttributes: true, trimValues: true, processEntities: true })

/** "Abu Dhabi, AE, 939" → { place: "Abu Dhabi, AE", country: "AE" }. */
function sfLocation(loc: string): { place: string; country?: string } {
  const parts = loc.split(',').map((p) => p.trim()).filter(Boolean)
  const cc = parts.find((p) => /^[A-Z]{2}$/.test(p))
  const place = parts.filter((p) => !/^\d+$/.test(p)).join(', ')
  return { place, country: cc }
}

export function parseSuccessFactorsFeed(text: string, displayName: string): DiscoveryItem[] {
  const parsed = xml.parse(text) as { rss?: { channel?: { item?: SfItem | SfItem[] } } }
  if (!parsed.rss?.channel) throw new Error('successfactors: job feed not found — the site layout may have changed')
  const raw = parsed.rss.channel.item ?? []
  const list = Array.isArray(raw) ? raw : [raw]
  return list.flatMap((it) => {
    const id = String(it['g:id'] ?? (typeof it.guid === 'string' ? it.guid : it.guid?.['#text']) ?? '')
    const link = clean(it.link)
    if (!id || !it.title || !/^https:\/\//.test(link)) return []
    const loc = sfLocation(clean(it['g:location']))
    // Titles carry the location: "Role (Abu Dhabi, AE, 939)".
    const title = clean(it.title).replace(/\s*\([^()]*,\s*[A-Z]{2}(,[^()]*)?\)\s*$/, '')
    const rawItem = { id, title: it.title, location: it['g:location'], employer: it['g:employer'], expires: it['g:expiration_date'] }
    const normalized: NormalizedJob = {
      kind: 'job',
      title,
      companyName: displayName,
      location: loc.place || undefined,
      remoteType: 'unknown',
      employmentType: 'unknown',
      descriptionMd: clean(it['g:job_function']),
      applyUrl: link,
      techStack: [],
      tags: ['ats:successfactors', ...(loc.country ? [`country:${loc.country.toLowerCase()}`] : [])],
      raw: rawItem,
    }
    return [{ sourceItemId: id, raw: rawItem, normalized }]
  })
}

export class SuccessFactorsAdapter implements DiscoveryAdapter {
  readonly kind = 'successfactors'

  async fetch(config: unknown, ctx?: AdapterContext): Promise<DiscoveryItem[]> {
    const cfg = sfConfig.parse(config)
    const host = safeHost(cfg.host)
    const res = await discoveryFetch('successfactors', `https://${host}/sitemal.xml`, {
      headers: { accept: 'application/rss+xml, application/xml' },
    })
    if (!res.ok) throw new Error(`successfactors ${res.status}`)
    const prefs = await searchPrefsFor(config, ctx)
    const wanted = new Set(prefs.countries.map((c) => c.toLowerCase()))
    return parseSuccessFactorsFeed(await res.text(), cfg.displayName).filter((i) => {
      const cc = (i.normalized as NormalizedJob).tags?.find((t) => t.startsWith('country:'))?.slice(8)
      return !cc || wanted.size === 0 || wanted.has(cc)
    })
  }
}

// ---------------------------------------------------------------------------
// Phenom People career sites — POST /widgets (refineSearch)
// ---------------------------------------------------------------------------

const phenomConfig = z.object({
  host: z.string(),
  /** From the site's search page (`phApp.pageId`), e.g. "page3". */
  pageId: z.string().regex(/^page\d{1,4}$/),
  /** Site locale pair, e.g. country "global" + lang "en_global". */
  country: z.string().regex(/^[a-z_]{2,20}$/).default('global'),
  lang: z.string().regex(/^[a-z]{2}_[a-z]{2,10}$/).default('en_global'),
  /** URL path prefix of job pages, e.g. "/global/en". */
  pathPrefix: z.string().regex(/^(\/[a-z_-]{2,20}){1,3}$/i).default('/global/en'),
  displayName: z.string().max(100),
})

interface PhenomJob {
  jobId?: string
  title?: string
  location?: string
  country?: string
  postedDate?: string
  descriptionTeaser?: string
  type?: string
}

interface PhenomResponse {
  refineSearch?: { totalHits?: number; data?: { jobs?: PhenomJob[] } }
}

const PHENOM_PAGE = 50
const PHENOM_MAX_PAGES = 4

function slugify(title: string): string {
  return title
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function normalizePhenomJob(j: PhenomJob, host: string, pathPrefix: string, companyName: string): DiscoveryItem | null {
  if (!j.jobId || !j.title) return null
  const raw = { jobId: j.jobId, title: j.title, location: j.location, country: j.country, postedDate: j.postedDate }
  const normalized: NormalizedJob = {
    kind: 'job',
    title: clean(j.title),
    companyName,
    location: clean(j.location) || undefined,
    remoteType: /remote/i.test(j.location ?? '') ? 'remote' : 'unknown',
    employmentType: 'unknown',
    descriptionMd: clean(j.descriptionTeaser),
    applyUrl: `https://${host}${pathPrefix}/job/${encodeURIComponent(j.jobId)}/${slugify(j.title)}`,
    postedAt: toDate(j.postedDate?.replace(/\+0000$/, 'Z')),
    techStack: [],
    tags: ['ats:phenom'],
    raw,
  }
  return { sourceItemId: j.jobId, raw, normalized }
}

export class PhenomAdapter implements DiscoveryAdapter {
  readonly kind = 'phenom'

  async fetch(config: unknown, ctx?: AdapterContext): Promise<DiscoveryItem[]> {
    const cfg = phenomConfig.parse(config)
    const host = safeHost(cfg.host)
    const prefs = await searchPrefsFor(config, ctx)
    const items: DiscoveryItem[] = []
    for (let page = 0; page < PHENOM_MAX_PAGES; page++) {
      const body = {
        lang: cfg.lang,
        deviceType: 'desktop',
        country: cfg.country,
        pageName: 'search-results',
        ddoKey: 'refineSearch',
        sortBy: 'Most recent',
        subsearch: '',
        from: page * PHENOM_PAGE,
        jobs: true,
        counts: true,
        all_fields: ['country', 'city'],
        size: PHENOM_PAGE,
        clearAll: false,
        jdsource: 'facets',
        isSliderEnable: false,
        pageId: cfg.pageId,
        siteType: 'external',
        keywords: '',
        global: true,
        selected_fields: {},
        locationData: {},
      }
      const res = await discoveryFetch('phenom', `https://${host}/widgets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`phenom ${res.status}`)
      const data = (await res.json()) as PhenomResponse
      const jobs = data.refineSearch?.data?.jobs
      if (!Array.isArray(jobs)) throw new Error('phenom: job list not found — check pageId / locale in the source config')
      for (const j of jobs) {
        if (!locationMatchesCountries(`${j.country ?? ''} ${j.location ?? ''}`, prefs.countries)) continue
        const item = normalizePhenomJob(j, host, cfg.pathPrefix, cfg.displayName)
        if (item) items.push(item)
      }
      if (jobs.length < PHENOM_PAGE || (page + 1) * PHENOM_PAGE >= (data.refineSearch?.totalHits ?? 0)) break
    }
    return items
  }
}
