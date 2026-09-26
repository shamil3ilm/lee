import { z } from 'zod'
import type { DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'
import { discoveryFetch } from './http'

const configSchema = z.object({ company: z.string() })

interface AshbyAddress {
  postalAddress?: {
    addressCountry?: string
    addressLocality?: string
    addressRegion?: string
  }
}

interface AshbyJob {
  id: string
  title: string
  department?: string
  team?: string
  employmentType?: string
  location?: string
  publishedAt?: string
  publishedDate?: string
  isRemote?: boolean | null
  workplaceType?: string | null
  jobUrl: string
  applyUrl?: string
  descriptionPlain?: string
  descriptionHtml?: string
  address?: AshbyAddress
  secondaryLocations?: unknown[]
}

interface AshbyResponse {
  jobs?: AshbyJob[]
}

/**
 * Ashby public job-board API. Returns `{ jobs: [...] }` with rich metadata.
 */
export class AshbyAdapter implements DiscoveryAdapter {
  readonly kind = 'ashby'

  async fetch(config: unknown): Promise<DiscoveryItem[]> {
    const { company } = configSchema.parse(config)
    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(company)}?includeCompensation=true`
    const res = await discoveryFetch('ashby', url)
    if (!res.ok) throw new Error(`ashby ${res.status}`)
    const body = (await res.json()) as AshbyResponse
    const jobs = body.jobs ?? []
    return jobs.map((job) => {
      const workplace = (job.workplaceType ?? '').toLowerCase()
      const remoteType: NormalizedJob['remoteType'] =
        job.isRemote === true || workplace === 'remote'
          ? 'remote'
          : workplace === 'hybrid'
            ? 'hybrid'
            : workplace === 'onsite' || workplace === 'on-site'
              ? 'onsite'
              : 'unknown'
      const et = (job.employmentType ?? '').toLowerCase()
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
      const posted = job.publishedAt ?? job.publishedDate
      const normalized: NormalizedJob = {
        kind: 'job',
        title: job.title,
        companyName: company,
        location: job.location,
        remoteType,
        employmentType,
        applyUrl: job.jobUrl,
        descriptionMd: job.descriptionPlain ?? job.descriptionHtml ?? '',
        techStack: [],
        postedAt: posted ? new Date(posted) : undefined,
        raw: job,
      }
      return {
        sourceItemId: job.id,
        raw: job,
        normalized,
      }
    })
  }
}
