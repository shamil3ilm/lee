import { z } from 'zod'
import type { AdapterContext, DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'
import { discoveryFetch } from './http'
import { employmentTypeOf, searchPrefsFor, toDate } from './prefs'
import { enrichSome, htmlToText, workModeOf } from './html-text'
import { COUNTRY_NAMES, locationMatchesCountries } from '../search-prefs'

/**
 * Workday career sites — the public JSON the careers page itself calls:
 *   POST https://{tenant}.wd{N}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs
 *   body { appliedFacets, limit (≤ 20), offset, searchText }
 *   → { total, facets[], jobPostings[{ title, externalPath, locationsText, postedOn, bulletFields }] }
 * Public posting URL: https://{host}/{site}{externalPath}. Checked live on
 * 2026-09-27 (salesforce.wd12 / External_Career_Site); the tenants'
 * robots.txt allow the site paths and don't disallow /wday/cxs/.
 *
 * Config: { url: "https://{tenant}.wd{N}.myworkdayjobs.com[/en-US]/{site}",
 *           searchText?, countries?, displayName? }.
 * Big employers list thousands of jobs, so the poll narrows to the target
 * countries through the site's own country facet when it has one (facet
 * names differ per tenant: any facet whose parameter mentions "country"),
 * and reads at most MAX_PAGES pages.
 */

const PAGE_SIZE = 20
const MAX_PAGES = 5
/**
 * The list has no description and only "Posted 3 Days Ago". The detail
 * JSON (GET /wday/cxs/{tenant}/{site}{externalPath}) has the full text,
 * the exact start date, the ISO country and the time type: read for at
 * most this many postings per poll (checked live 2026-10-08, ~0.3 s each).
 */
const DETAIL_MAX = 25
const DETAIL_CONCURRENCY = 4
const HOST_RE = /^([a-z0-9-]+)\.(wd\d{1,3})\.myworkday(?:jobs|site)\.com$/i
const SITE_RE = /^[A-Za-z0-9_-]{1,100}$/
const LOCALE_RE = /^[a-z]{2}-[A-Z]{2}$/

const configSchema = z
  .object({
    url: z.string().url(),
    searchText: z.string().max(100).optional(),
    displayName: z.string().max(100).optional(),
  })
  .passthrough()

export interface WorkdaySite {
  host: string
  tenant: string
  site: string
}

/** Parse and validate a Workday career-site URL (only *.myworkdayjobs.com hosts). */
export function parseWorkdayUrl(url: string): WorkdaySite | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase()
  const m = host.match(HOST_RE)
  if (!m?.[1]) return null
  const segments = u.pathname.split('/').filter(Boolean)
  const site = LOCALE_RE.test(segments[0] ?? '') ? segments[1] : segments[0]
  if (!site || !SITE_RE.test(site)) return null
  return { host, tenant: m[1], site }
}

interface WorkdayPosting {
  title?: string
  externalPath?: string
  locationsText?: string
  postedOn?: string
  bulletFields?: string[]
}

interface WorkdayFacetValue {
  descriptor?: string
  id?: string
  count?: number
  values?: WorkdayFacetValue[]
  facetParameter?: string
}

interface WorkdayFacet {
  facetParameter?: string
  values?: WorkdayFacetValue[]
}

interface WorkdayResponse {
  total?: number
  facets?: WorkdayFacet[]
  jobPostings?: WorkdayPosting[]
}

/** "Posted Today" / "Posted Yesterday" / "Posted 3 Days Ago" / "Posted 30+ Days Ago". */
export function postedOnToDate(postedOn: string | undefined, now: Date = new Date()): Date | undefined {
  if (!postedOn) return undefined
  const s = postedOn.toLowerCase()
  const day = 86_400_000
  if (s.includes('today')) return new Date(now.getTime())
  if (s.includes('yesterday')) return new Date(now.getTime() - day)
  const m = s.match(/(\d+)\+?\s*days?\s*ago/)
  return m?.[1] ? new Date(now.getTime() - Number(m[1]) * day) : undefined
}

/** "/job/India---Bangalore/Title_JR1" → "India - Bangalore" when the list only says "2 Locations". */
function locationOf(p: WorkdayPosting): string | undefined {
  const text = p.locationsText?.trim()
  if (text && !/^\d+\s+locations?$/i.test(text)) return text
  const seg = p.externalPath?.split('/')[2]
  return seg
    ? seg
        .split('---')
        .map((part) => part.replace(/-/g, ' ').trim())
        .join(' - ')
    : text
}

/** Country facet ids for the target countries (facet names vary per tenant). */
export function countryFacet(facets: readonly WorkdayFacet[], countryNames: readonly string[]): { param: string; ids: string[] } | null {
  const wanted = new Set(countryNames.map((n) => n.toLowerCase()))
  const flat = (f: WorkdayFacet): Array<{ param: string; values: WorkdayFacetValue[] }> => {
    const nested = (f.values ?? []).filter((v) => v.facetParameter && v.values)
    return [
      ...(f.facetParameter ? [{ param: f.facetParameter, values: f.values ?? [] }] : []),
      ...nested.map((v) => ({ param: v.facetParameter as string, values: v.values ?? [] })),
    ]
  }
  for (const { param, values } of facets.flatMap(flat)) {
    if (!/country/i.test(param)) continue
    const ids = values
      .filter((v) => v.id && v.descriptor && wanted.has(v.descriptor.toLowerCase()))
      .map((v) => v.id as string)
    return { param, ids }
  }
  return null
}

export function normalizeWorkdayPosting(p: WorkdayPosting, site: WorkdaySite, companyName: string, now = new Date()): DiscoveryItem | null {
  if (!p.title || !p.externalPath) return null
  const applyUrl = `https://${site.host}/${site.site}${p.externalPath}`
  const location = locationOf(p)
  const remote = /\bremote\b/i.test(`${location ?? ''} ${p.title}`)
  const raw = { title: p.title, externalPath: p.externalPath, locationsText: p.locationsText, postedOn: p.postedOn, reqId: p.bulletFields?.[0] }
  const normalized: NormalizedJob = {
    kind: 'job',
    title: p.title,
    companyName,
    location,
    remoteType: remote ? 'remote' : 'unknown',
    employmentType: 'unknown',
    descriptionMd: '',
    applyUrl,
    postedAt: postedOnToDate(p.postedOn, now),
    techStack: [],
    tags: ['ats:workday'],
    raw,
  }
  return { sourceItemId: p.externalPath, raw, normalized }
}

interface WorkdayDetail {
  jobPostingInfo?: {
    jobDescription?: string
    startDate?: string
    timeType?: string
    remoteType?: string
    location?: string
    jobRequisitionLocation?: { country?: { alpha2Code?: string } }
  }
}

/** Merge a posting's detail JSON into its list item (pure; exported for tests). */
export function withWorkdayDetail(item: DiscoveryItem, detail: WorkdayDetail): DiscoveryItem {
  const info = detail.jobPostingInfo
  if (!info) return item
  const job = item.normalized as NormalizedJob
  const cc = info.jobRequisitionLocation?.country?.alpha2Code
  const mode = workModeOf(info.remoteType)
  const normalized: NormalizedJob = {
    ...job,
    descriptionMd: htmlToText(info.jobDescription) || job.descriptionMd,
    postedAt: toDate(info.startDate) ?? job.postedAt,
    employmentType: info.timeType ? employmentTypeOf(info.timeType) : job.employmentType,
    remoteType: mode !== 'unknown' ? mode : job.remoteType,
    tags: [...(job.tags ?? []), ...(cc ? [`country:${cc.toLowerCase()}`] : [])],
  }
  return { ...item, normalized }
}

export class WorkdayAdapter implements DiscoveryAdapter {
  readonly kind = 'workday'

  async fetch(config: unknown, ctx?: AdapterContext): Promise<DiscoveryItem[]> {
    const cfg = configSchema.parse(config)
    const site = parseWorkdayUrl(cfg.url)
    if (!site) throw new Error('workday: the URL must be a https://{tenant}.wd{N}.myworkdayjobs.com/{site} careers page')
    const endpoint = `https://${site.host}/wday/cxs/${site.tenant}/${site.site}/jobs`
    const companyName = cfg.displayName ?? site.tenant
    const post = async (appliedFacets: Record<string, string[]>, offset: number): Promise<WorkdayResponse> => {
      const res = await discoveryFetch('workday', endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ appliedFacets, limit: PAGE_SIZE, offset, searchText: cfg.searchText ?? '' }),
      })
      if (!res.ok) throw new Error(`workday ${res.status}`)
      return (await res.json()) as WorkdayResponse
    }

    const first = await post({}, 0)
    const prefs = await searchPrefsFor(config, ctx)
    const names = prefs.countries.map((c) => COUNTRY_NAMES[c] ?? c)
    const facet = countryFacet(first.facets ?? [], names)
    // The site has a country facet but none of the target countries: nothing to read.
    if (facet && facet.ids.length === 0) return []
    const facets = facet ? { [facet.param]: facet.ids } : {}

    const items = new Map<string, DiscoveryItem>()
    let page = facet ? await post(facets, 0) : first
    // Workday reports `total` on the first page only (later pages say 0).
    const total = page.total ?? 0
    for (let i = 0; i < MAX_PAGES; i++) {
      for (const p of page.jobPostings ?? []) {
        // No country facet on this site: keep postings whose location or
        // path names a target country / city ("2 Locations" can't be told).
        if (!facet && !locationMatchesCountries(`${p.locationsText ?? ''} ${p.externalPath ?? ''}`.replace(/-/g, ' '), prefs.countries)) {
          continue
        }
        const item = normalizeWorkdayPosting(p, site, companyName)
        if (item && !items.has(item.sourceItemId)) items.set(item.sourceItemId, item)
      }
      const offset = (i + 1) * PAGE_SIZE
      if ((page.jobPostings ?? []).length < PAGE_SIZE || offset >= total) break
      page = await post(facets, offset)
    }
    const base = `https://${site.host}/wday/cxs/${site.tenant}/${site.site}`
    return enrichSome([...items.values()], DETAIL_MAX, DETAIL_CONCURRENCY, async (item) => {
      const res = await discoveryFetch('workday', `${base}${item.sourceItemId}`, { headers: { accept: 'application/json' } })
      return res.ok ? withWorkdayDetail(item, (await res.json()) as WorkdayDetail) : item
    })
  }
}
