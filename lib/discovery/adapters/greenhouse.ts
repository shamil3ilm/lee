import { z } from 'zod'
import type { DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'
import { discoveryFetch } from './http'

const configSchema = z.object({ company: z.string() })

interface GreenhouseJob {
  id: number
  title: string
  absolute_url: string
  updated_at?: string | null
  location?: { name?: string } | null
  content?: string
}

interface GreenhouseResponse {
  jobs?: GreenhouseJob[]
}

/**
 * Greenhouse public job-board API — no auth required, one call per board.
 * Descriptions ship inline as HTML in `content` on the list endpoint for most
 * boards; we hand it through unmodified so the AI scorer can inspect it.
 */
export class GreenhouseAdapter implements DiscoveryAdapter {
  readonly kind = 'greenhouse'

  async fetch(config: unknown): Promise<DiscoveryItem[]> {
    const { company } = configSchema.parse(config)
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(company)}/jobs?content=true`
    const res = await discoveryFetch('greenhouse', url)
    if (!res.ok) throw new Error(`greenhouse ${res.status}`)
    const body = (await res.json()) as GreenhouseResponse
    const jobs = body.jobs ?? []
    return jobs.map((job) => {
      const normalized: NormalizedJob = {
        kind: 'job',
        title: job.title,
        companyName: company,
        location: job.location?.name ?? undefined,
        applyUrl: job.absolute_url,
        descriptionMd: job.content ?? '',
        techStack: [],
        postedAt: job.updated_at ? new Date(job.updated_at) : undefined,
        raw: job,
      }
      return {
        sourceItemId: String(job.id),
        raw: job,
        normalized,
      }
    })
  }
}
