import { z } from 'zod'
import type { DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'
import { discoveryFetch } from './http'
import { htmlToText, workModeOf } from './html-text'

const configSchema = z.object({ company: z.string() })

interface GreenhouseJob {
  id: number
  title: string
  absolute_url: string
  updated_at?: string | null
  first_published?: string | null
  company_name?: string | null
  location?: { name?: string } | null
  content?: string
}

interface GreenhouseResponse {
  jobs?: GreenhouseJob[]
}

/**
 * Greenhouse public job-board API — no auth required, one call per board.
 * Descriptions ship inline in `content` as entity-escaped HTML; they are
 * stored as plain text so the gate and the match score can read them.
 * `first_published` is the posting date (`updated_at` moves on every edit).
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
      const location = job.location?.name?.trim() || undefined
      const posted = job.first_published ?? job.updated_at
      const normalized: NormalizedJob = {
        kind: 'job',
        title: job.title,
        companyName: job.company_name?.trim() || company,
        location,
        remoteType: workModeOf(`${location ?? ''} ${job.title}`),
        applyUrl: job.absolute_url,
        descriptionMd: htmlToText(job.content),
        techStack: [],
        postedAt: posted ? new Date(posted) : undefined,
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
