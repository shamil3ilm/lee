import type { AdapterContext, DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'
import { discoveryFetch } from './http'
import { employmentTypeOf, geoTag, searchPrefsFor, toDate } from './prefs'

/**
 * Jobicy remote-jobs API v2 (no key). https://jobicy.com/jobs-rss-feed
 *
 * Terms (live response notice, 2026-09-27): credit Jobicy with a direct
 * link to the source and send every apply button to the job URL in the
 * feed (applyUrl = the Jobicy URL). Poll at most once an hour; lee polls
 * daily.
 *
 * Jobicy has no India or per-GCC-country geo except the UAE, so target
 * countries map to its regions: AE → united-arab-emirates, the rest of the
 * GCC → emea, India → apac; "anywhere" is always included.
 */

const BASE = 'https://jobicy.com/api/v2/remote-jobs'
const COUNT = '50'

const GEO_BY_COUNTRY: Readonly<Record<string, string>> = {
  AE: 'united-arab-emirates',
  SA: 'emea',
  QA: 'emea',
  KW: 'emea',
  BH: 'emea',
  OM: 'emea',
  IN: 'apac',
}

interface JobicyJob {
  id?: number | string
  url?: string
  jobTitle?: string
  companyName?: string
  jobIndustry?: string[]
  jobType?: string[]
  jobGeo?: string
  jobLevel?: string
  jobExcerpt?: string
  pubDate?: string
  salaryMin?: number
  salaryMax?: number
  salaryCurrency?: string
}

export function geosFor(countries: readonly string[]): string[] {
  const geos = countries.map((c) => GEO_BY_COUNTRY[c]).filter((g): g is string => Boolean(g))
  return [...new Set(['anywhere', ...geos])]
}

export function normalizeJobicyJob(job: JobicyJob): DiscoveryItem | null {
  if (!job.jobTitle || !job.companyName || !job.url) return null
  const geo = (job.jobGeo ?? '').replace(/\s+/g, ' ').trim()
  const raw = { id: job.id, url: job.url, jobTitle: job.jobTitle, companyName: job.companyName, jobGeo: geo, jobLevel: job.jobLevel, pubDate: job.pubDate }
  const normalized: NormalizedJob = {
    kind: 'job',
    title: job.jobTitle,
    companyName: job.companyName,
    location: geo ? `Remote (${geo})` : 'Remote',
    remoteType: 'remote',
    employmentType: employmentTypeOf(job.jobType),
    descriptionMd: job.jobExcerpt ?? '',
    applyUrl: job.url,
    postedAt: toDate(job.pubDate),
    techStack: [],
    salary:
      job.salaryMin || job.salaryMax
        ? { min: job.salaryMin, max: job.salaryMax, currency: job.salaryCurrency }
        : undefined,
    tags: ['board:jobicy', geoTag(/^anywhere$/i.test(geo))],
    raw,
  }
  return { sourceItemId: String(job.id ?? job.url), raw, normalized }
}

export class JobicyAdapter implements DiscoveryAdapter {
  readonly kind = 'jobicy'

  async fetch(config: unknown, ctx?: AdapterContext): Promise<DiscoveryItem[]> {
    const prefs = await searchPrefsFor(config, ctx)
    const items = new Map<string, DiscoveryItem>()
    let succeeded = 0
    let lastError: Error | null = null
    for (const geo of geosFor(prefs.countries)) {
      const params = new URLSearchParams({ count: COUNT, geo, industry: 'engineering' })
      const res = await discoveryFetch('jobicy', `${BASE}?${params.toString()}`, {
        headers: { accept: 'application/json' },
      })
      if (!res.ok) {
        lastError = new Error(`jobicy ${res.status}`)
        if (res.status === 429) break
        continue
      }
      succeeded += 1
      const body = (await res.json()) as { jobs?: JobicyJob[] }
      for (const job of body.jobs ?? []) {
        const item = normalizeJobicyJob(job)
        if (item && !items.has(item.sourceItemId)) items.set(item.sourceItemId, item)
      }
    }
    if (succeeded === 0 && lastError) throw lastError
    return [...items.values()]
  }
}
