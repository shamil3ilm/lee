import type { AdapterContext, DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'
import { discoveryFetch } from './http'
import { employmentTypeOf, geoTag, searchPrefsFor, toDate } from './prefs'
import type { Seniority } from '../search-prefs'

/**
 * Himalayas public jobs API (remote jobs; no key). https://himalayas.app/api
 *
 * Terms (checked 2026-09-27): link back to the Himalayas URL and name
 * Himalayas as the source (the source badge + applyUrl do both); never
 * pass the jobs on to other job boards. Data refreshes every 24 h, so one
 * poll a day is all that's useful. Rate limit unpublished: a 429 ends the
 * poll with what was fetched so far.
 *
 * Calls per poll: one per target country (country-restricted roles only)
 * with the first keyword, plus one worldwide call per keyword.
 */

const BASE = 'https://himalayas.app/jobs/api/search'
const MAX_CALLS = 10
const MAX_LOCATIONS_SHOWN = 4

const SENIORITY: Record<Seniority, string> = {
  junior: 'Entry-level',
  mid: 'Mid-level',
  senior: 'Senior',
}

interface HimalayasJob {
  title?: string
  excerpt?: string
  companyName?: string
  companySlug?: string
  employmentType?: string
  minSalary?: number | null
  maxSalary?: number | null
  currency?: string
  seniority?: string[]
  locationRestrictions?: string[]
  categories?: string[]
  description?: string
  pubDate?: number
  applicationLink?: string
  guid?: string
}

interface HimalayasResponse {
  jobs?: HimalayasJob[]
}

function locationOf(restrictions: readonly string[]): string {
  if (restrictions.length === 0) return 'Remote (worldwide)'
  const shown = restrictions.slice(0, MAX_LOCATIONS_SHOWN).join(', ')
  const more = restrictions.length - MAX_LOCATIONS_SHOWN
  return `Remote (${shown}${more > 0 ? ` +${more} more` : ''})`
}

export function normalizeHimalayasJob(job: HimalayasJob): DiscoveryItem | null {
  const url = job.applicationLink ?? job.guid
  if (!job.title || !job.companyName || !url) return null
  const restrictions = Array.isArray(job.locationRestrictions) ? job.locationRestrictions : []
  const raw = {
    guid: job.guid,
    title: job.title,
    companyName: job.companyName,
    seniority: job.seniority,
    locationRestrictions: restrictions,
    pubDate: job.pubDate,
  }
  const normalized: NormalizedJob = {
    kind: 'job',
    title: job.title,
    companyName: job.companyName,
    location: locationOf(restrictions),
    remoteType: 'remote',
    employmentType: employmentTypeOf(job.employmentType),
    descriptionMd: job.excerpt ?? '',
    applyUrl: url,
    postedAt: toDate(job.pubDate),
    techStack: [],
    salary:
      job.minSalary || job.maxSalary
        ? { min: job.minSalary ?? undefined, max: job.maxSalary ?? undefined, currency: job.currency }
        : undefined,
    tags: ['board:himalayas', geoTag(restrictions.length === 0)],
    raw,
  }
  return { sourceItemId: job.guid ?? url, raw, normalized }
}

export class HimalayasAdapter implements DiscoveryAdapter {
  readonly kind = 'himalayas'

  async fetch(config: unknown, ctx?: AdapterContext): Promise<DiscoveryItem[]> {
    const prefs = await searchPrefsFor(config, ctx)
    const seniority = prefs.seniority.map((s) => SENIORITY[s]).join(',')
    const [first = 'backend developer'] = prefs.keywords
    const calls: URLSearchParams[] = [
      ...prefs.countries.map(
        (country) => new URLSearchParams({ q: first, country, exclude_worldwide: 'true', seniority, sort: 'recent' }),
      ),
      ...prefs.keywords.map((q) => new URLSearchParams({ q, worldwide: 'true', seniority, sort: 'recent' })),
    ].slice(0, MAX_CALLS)

    const items = new Map<string, DiscoveryItem>()
    let lastError: Error | null = null
    let succeeded = 0
    for (const params of calls) {
      const res = await discoveryFetch('himalayas', `${BASE}?${params.toString()}`, {
        headers: { accept: 'application/json' },
      })
      if (res.status === 429) {
        lastError = new Error('himalayas 429')
        break
      }
      if (!res.ok) {
        lastError = new Error(`himalayas ${res.status}`)
        continue
      }
      succeeded += 1
      const body = (await res.json()) as HimalayasResponse
      for (const job of body.jobs ?? []) {
        const item = normalizeHimalayasJob(job)
        if (item && !items.has(item.sourceItemId)) items.set(item.sourceItemId, item)
      }
    }
    if (succeeded === 0 && lastError) throw lastError
    return [...items.values()]
  }
}
