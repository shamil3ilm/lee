import type { AdapterContext, DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'
import { discoveryFetch } from './http'
import { employmentTypeOf, searchPrefsFor, toDate } from './prefs'

/**
 * Adzuna job search API (free key). https://developer.adzuna.com/docs/search
 *
 * Countries: Adzuna covers India (`in`) but none of the GCC countries
 * (country enum in its Swagger spec, checked 2026-09-27), so only target
 * countries it supports are searched.
 *
 * Terms (https://developer.adzuna.com/docs/terms_of_service): listings are
 * shown with the "Jobs by Adzuna" credit linking to Adzuna (the source is
 * named that way and applyUrl is Adzuna's redirect_url); default limits
 * 25 hits/minute, 250/day — lee makes at most MAX_CALLS per daily poll.
 *
 * Key: "APP_ID:APP_KEY" in Settings › AI › Service keys (id `adzuna`).
 */

export const ADZUNA_COUNTRIES = ['gb', 'us', 'at', 'au', 'be', 'br', 'ca', 'ch', 'de', 'es', 'fr', 'in', 'it', 'mx', 'nl', 'nz', 'pl', 'sg', 'za'] as const
const MAX_CALLS = 4
const RESULTS_PER_PAGE = '50'
const MAX_DAYS_OLD = '14'

export class MissingAdzunaKeyError extends Error {
  constructor() {
    super('Adzuna needs an API key: add it in Settings › AI › Service keys (format APP_ID:APP_KEY).')
    this.name = 'MissingAdzunaKeyError'
  }
}

export function parseAdzunaKey(key: string): { appId: string; appKey: string } | null {
  const idx = key.indexOf(':')
  if (idx <= 0 || idx === key.length - 1) return null
  const appId = key.slice(0, idx).trim()
  const appKey = key.slice(idx + 1).trim()
  return appId && appKey ? { appId, appKey } : null
}

interface AdzunaJob {
  id?: string | number
  title?: string
  description?: string
  created?: string
  redirect_url?: string
  company?: { display_name?: string }
  location?: { display_name?: string; area?: string[] }
  salary_min?: number
  salary_max?: number
  contract_time?: string
  contract_type?: string
}

/** Adzuna wraps matched words in <strong>; titles are plain text in lee. */
function plain(s: string): string {
  return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

export function normalizeAdzunaJob(job: AdzunaJob, country: string): DiscoveryItem | null {
  if (!job.id || !job.title || !job.redirect_url) return null
  const title = plain(job.title)
  const companyName = plain(job.company?.display_name ?? '') || 'Unknown company'
  const location = job.location?.display_name ? plain(job.location.display_name) : undefined
  const remote = /\bremote\b/i.test(`${title} ${location ?? ''}`)
  const raw = { id: String(job.id), country, title, companyName, location, created: job.created }
  const normalized: NormalizedJob = {
    kind: 'job',
    title,
    companyName,
    location,
    remoteType: remote ? 'remote' : 'unknown',
    employmentType: employmentTypeOf(`${job.contract_time ?? ''} ${job.contract_type ?? ''}`),
    descriptionMd: plain(job.description ?? ''),
    applyUrl: job.redirect_url,
    postedAt: toDate(job.created),
    techStack: [],
    salary:
      job.salary_min || job.salary_max
        ? { min: job.salary_min, max: job.salary_max, currency: country === 'in' ? 'INR' : undefined }
        : undefined,
    tags: ['board:adzuna', `country:${country}`],
    raw,
  }
  return { sourceItemId: `${country}:${job.id}`, raw, normalized }
}

export interface AdzunaDeps {
  /** Resolves the user's "APP_ID:APP_KEY" (saved key, else env for the owner only). */
  resolveKey: (userId: string | undefined) => Promise<string | null>
}

async function defaultResolveKey(userId: string | undefined): Promise<string | null> {
  // No user, no key: ADZUNA_KEY is the owner's and is reached only through
  // resolveServiceSecret's owner-only fallback (every poll passes a userId).
  if (!userId) return null
  const { resolveServiceSecret } = await import('@/lib/settings/secrets')
  return (await resolveServiceSecret(userId, 'adzuna')).key
}

export class AdzunaAdapter implements DiscoveryAdapter {
  readonly kind = 'adzuna'

  constructor(private readonly deps: AdzunaDeps = { resolveKey: defaultResolveKey }) {}

  async fetch(config: unknown, ctx?: AdapterContext): Promise<DiscoveryItem[]> {
    const raw = await this.deps.resolveKey(ctx?.userId)
    const creds = raw ? parseAdzunaKey(raw) : null
    if (!creds) throw new MissingAdzunaKeyError()
    const prefs = await searchPrefsFor(config, ctx)
    const countries = prefs.countries
      .map((c) => c.toLowerCase())
      .filter((c): c is (typeof ADZUNA_COUNTRIES)[number] => (ADZUNA_COUNTRIES as readonly string[]).includes(c))
    if (countries.length === 0) return []

    const calls = countries.flatMap((country) => prefs.keywords.map((what) => ({ country, what }))).slice(0, MAX_CALLS)
    const items = new Map<string, DiscoveryItem>()
    let succeeded = 0
    let lastError: Error | null = null
    for (const { country, what } of calls) {
      const params = new URLSearchParams({
        app_id: creds.appId,
        app_key: creds.appKey,
        what,
        results_per_page: RESULTS_PER_PAGE,
        sort_by: 'date',
        max_days_old: MAX_DAYS_OLD,
        'content-type': 'application/json',
      })
      const res = await discoveryFetch('adzuna', `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params.toString()}`, {
        headers: { accept: 'application/json' },
      })
      if (res.status === 401 || res.status === 403) throw new Error('adzuna rejected the API key')
      if (!res.ok) {
        lastError = new Error(`adzuna ${res.status}`)
        if (res.status === 429) break
        continue
      }
      succeeded += 1
      const body = (await res.json()) as { results?: AdzunaJob[] }
      for (const job of body.results ?? []) {
        const item = normalizeAdzunaJob(job, country)
        if (item && !items.has(item.sourceItemId)) items.set(item.sourceItemId, item)
      }
    }
    if (succeeded === 0 && lastError) throw lastError
    return [...items.values()]
  }
}
