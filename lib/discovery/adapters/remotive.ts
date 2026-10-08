import type { DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'
import { discoveryFetch } from './http'
import { htmlToText } from './html-text'
import { employmentTypeOf, geoTag, toDate } from './prefs'

/**
 * Remotive public API (no key). https://github.com/remotive-com/remote-jobs-api
 *
 * Terms (the API's own legal notice, 2026-09-27): link back to the
 * Remotive URL AND mention Remotive as the source; never submit the jobs
 * to other job sites; at most 4 requests a day (lee: one). The free feed
 * is small and delayed by 24 h.
 */

const URL_ = 'https://remotive.com/api/remote-jobs?category=software-dev&limit=100'

interface RemotiveJob {
  id?: number | string
  url?: string
  title?: string
  company_name?: string
  category?: string
  tags?: string[]
  job_type?: string
  publication_date?: string
  candidate_required_location?: string
  /** HTML; carries eligibility text ("US only", "relocation package"). */
  description?: string
  salary?: string
}

export function normalizeRemotiveJob(job: RemotiveJob): DiscoveryItem | null {
  if (!job.title || !job.company_name || !job.url) return null
  const where = (job.candidate_required_location ?? '').trim()
  const raw = { id: job.id, url: job.url, title: job.title, company_name: job.company_name, candidate_required_location: where, publication_date: job.publication_date }
  const normalized: NormalizedJob = {
    kind: 'job',
    title: job.title,
    companyName: job.company_name,
    location: where ? `Remote (${where})` : 'Remote',
    remoteType: 'remote',
    employmentType: employmentTypeOf(job.job_type),
    descriptionMd: htmlToText([job.salary ? `Salary: ${job.salary}` : '', job.description].filter(Boolean).join('<br>')),
    applyUrl: job.url,
    postedAt: toDate(job.publication_date),
    techStack: Array.isArray(job.tags) ? job.tags.slice(0, 12) : [],
    tags: ['board:remotive', geoTag(where === '' || /worldwide|anywhere/i.test(where))],
    raw,
  }
  return { sourceItemId: String(job.id ?? job.url), raw, normalized }
}

export class RemotiveAdapter implements DiscoveryAdapter {
  readonly kind = 'remotive'

  async fetch(): Promise<DiscoveryItem[]> {
    const res = await discoveryFetch('remotive', URL_, {
      headers: { accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`remotive ${res.status}`)
    const body = (await res.json()) as { jobs?: RemotiveJob[] }
    return (body.jobs ?? []).map(normalizeRemotiveJob).filter((x): x is DiscoveryItem => x !== null)
  }
}
