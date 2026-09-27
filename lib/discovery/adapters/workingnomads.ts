import type { DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'
import { discoveryFetch } from './http'
import { geoTag, toDate } from './prefs'

/**
 * Working Nomads public job feed (no key), linked from its homepage:
 *   GET https://www.workingnomads.com/api/exposed_jobs/
 * robots.txt allows everything and the terms have no scraping clause
 * (checked 2026-09-27); there's no written licence either, so lee only
 * links back to each posting and polls once a day. Only the
 * "Development" category is kept (the feed is all categories).
 */

const URL_ = 'https://www.workingnomads.com/api/exposed_jobs/'

interface WorkingNomadsJob {
  url?: string
  title?: string
  company_name?: string
  category_name?: string
  tags?: string
  location?: string
  pub_date?: string
}

export function normalizeWorkingNomadsJob(job: WorkingNomadsJob): DiscoveryItem | null {
  if (!job.url || !job.title || !job.company_name) return null
  if ((job.category_name ?? '').toLowerCase() !== 'development') return null
  // Titles often repeat the company: "Acme - Backend Engineer".
  const prefix = `${job.company_name} - `
  const title = job.title.startsWith(prefix) ? job.title.slice(prefix.length) : job.title
  const where = (job.location ?? '').trim()
  const raw = { url: job.url, title: job.title, company_name: job.company_name, location: where, pub_date: job.pub_date }
  const normalized: NormalizedJob = {
    kind: 'job',
    title,
    companyName: job.company_name,
    location: where || 'Remote',
    remoteType: 'remote',
    employmentType: 'unknown',
    descriptionMd: '',
    applyUrl: job.url,
    postedAt: toDate(job.pub_date),
    techStack: (job.tags ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 12),
    tags: ['board:workingnomads', geoTag(where === '' || /anywhere|worldwide/i.test(where))],
    raw,
  }
  return { sourceItemId: job.url, raw, normalized }
}

export class WorkingNomadsAdapter implements DiscoveryAdapter {
  readonly kind = 'workingnomads'

  async fetch(): Promise<DiscoveryItem[]> {
    const res = await discoveryFetch('workingnomads', URL_, { headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(`workingnomads ${res.status}`)
    const body = (await res.json()) as unknown
    if (!Array.isArray(body)) throw new Error('workingnomads: unexpected shape')
    return (body as WorkingNomadsJob[]).map(normalizeWorkingNomadsJob).filter((x): x is DiscoveryItem => x !== null)
  }
}
