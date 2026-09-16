import { z } from 'zod'
import type { DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'

const configSchema = z.object({ company: z.string() })

interface WorkableLocation {
  city?: string
  region?: string
  country?: string
  countryCode?: string
}

interface WorkableJob {
  id: string
  title: string
  url?: string
  shortcode?: string
  location?: WorkableLocation
  published_on?: string
  created_at?: string
  department?: string
  employment_type?: string
  workplace?: string
  description?: string
  full_title?: string
}

interface WorkableResponse {
  jobs?: WorkableJob[]
  results?: WorkableJob[]
}

/**
 * Workable public jobs API. The apply.workable.com host serves company job
 * boards; the /jobs endpoint returns a paginated list. We fetch page 1 only
 * per poll (fresh jobs appear first).
 */
export class WorkableAdapter implements DiscoveryAdapter {
  readonly kind = 'workable'

  async fetch(config: unknown): Promise<DiscoveryItem[]> {
    const { company } = configSchema.parse(config)
    const url = `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(company)}/jobs`
    // Workable's public endpoint uses POST for filters; empty body returns all.
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (!res.ok) throw new Error(`workable ${res.status}`)
    const body = (await res.json()) as WorkableResponse
    const jobs = body.results ?? body.jobs ?? []
    return jobs.map((job) => {
      const workplace = (job.workplace ?? '').toLowerCase()
      const remoteType: NormalizedJob['remoteType'] =
        workplace === 'remote'
          ? 'remote'
          : workplace === 'hybrid'
            ? 'hybrid'
            : workplace === 'on_site' || workplace === 'onsite'
              ? 'onsite'
              : 'unknown'
      const et = (job.employment_type ?? '').toLowerCase()
      const employmentType: NormalizedJob['employmentType'] =
        et.includes('full')
          ? 'fulltime'
          : et.includes('contract')
            ? 'contract'
            : et.includes('part')
              ? 'parttime'
              : et.includes('intern')
                ? 'internship'
                : 'unknown'
      const locBits = [job.location?.city, job.location?.region, job.location?.country].filter(
        Boolean,
      )
      const applyUrl =
        job.url ??
        (job.shortcode
          ? `https://apply.workable.com/${company}/j/${job.shortcode}/`
          : `https://apply.workable.com/${company}/`)
      const posted = job.published_on ?? job.created_at
      const normalized: NormalizedJob = {
        kind: 'job',
        title: job.title,
        companyName: company,
        location: locBits.length > 0 ? locBits.join(', ') : undefined,
        remoteType,
        employmentType,
        applyUrl,
        descriptionMd: job.description ?? '',
        techStack: [],
        postedAt: posted ? new Date(posted) : undefined,
        raw: job,
      }
      return {
        sourceItemId: job.id ?? job.shortcode ?? applyUrl,
        raw: job,
        normalized,
      }
    })
  }
}
