import { z } from 'zod'
import type { DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'
import { discoveryFetch } from './http'

const configSchema = z.object({ company: z.string() })

interface LeverPosting {
  id: string
  text: string
  hostedUrl: string
  applyUrl?: string
  createdAt?: number
  categories?: {
    location?: string
    team?: string
    department?: string
    commitment?: string
    allLocations?: string[]
  }
  workplaceType?: string
  country?: string
  descriptionPlain?: string
  description?: string
}

/**
 * Lever public postings API. Returns a bare array (no wrapper object). The
 * `mode=json` flag opts in to JSON output; without it Lever renders HTML.
 */
export class LeverAdapter implements DiscoveryAdapter {
  readonly kind = 'lever'

  async fetch(config: unknown): Promise<DiscoveryItem[]> {
    const { company } = configSchema.parse(config)
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`
    const res = await discoveryFetch('lever', url)
    if (!res.ok) throw new Error(`lever ${res.status}`)
    const postings = (await res.json()) as LeverPosting[]
    return postings.map((job) => {
      const workplace = (job.workplaceType ?? '').toLowerCase()
      const remoteType: NormalizedJob['remoteType'] =
        workplace === 'remote'
          ? 'remote'
          : workplace === 'hybrid'
            ? 'hybrid'
            : workplace === 'onsite' || workplace === 'on-site'
              ? 'onsite'
              : 'unknown'
      const commitment = (job.categories?.commitment ?? '').toLowerCase()
      const employmentType: NormalizedJob['employmentType'] =
        commitment.includes('full')
          ? 'fulltime'
          : commitment.includes('contract')
            ? 'contract'
            : commitment.includes('part')
              ? 'parttime'
              : commitment.includes('intern')
                ? 'internship'
                : 'unknown'
      const normalized: NormalizedJob = {
        kind: 'job',
        title: job.text,
        companyName: company,
        location: job.categories?.location ?? job.categories?.allLocations?.[0],
        remoteType,
        employmentType,
        applyUrl: job.hostedUrl,
        descriptionMd: job.descriptionPlain ?? job.description ?? '',
        techStack: [],
        postedAt: job.createdAt ? new Date(job.createdAt) : undefined,
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
