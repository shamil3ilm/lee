import type { DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'

interface RemoteOkJob {
  id?: string | number
  slug?: string
  position?: string
  company?: string
  company_logo?: string
  url?: string
  apply_url?: string
  description?: string
  tags?: string[]
  location?: string
  date?: string
  epoch?: number
}

/**
 * RemoteOK free JSON API. Returns an array whose first element is a legal
 * notice / metadata object and the rest are job postings.
 */
export class RemoteOkAdapter implements DiscoveryAdapter {
  readonly kind = 'remoteok'

  async fetch(_config: unknown): Promise<DiscoveryItem[]> {
    const res = await fetch('https://remoteok.com/api', {
      headers: { accept: 'application/json', 'user-agent': 'employ/1.5' },
    })
    if (!res.ok) throw new Error(`remoteok ${res.status}`)
    const body = (await res.json()) as unknown[]
    if (!Array.isArray(body)) throw new Error('remoteok: unexpected shape')
    // First element is metadata / legal notice — skip.
    const jobs = body.slice(1) as RemoteOkJob[]
    const items: DiscoveryItem[] = []
    for (const job of jobs) {
      if (!job || !job.position || !job.company) continue
      const id = String(job.id ?? job.slug ?? job.url ?? '')
      if (!id) continue
      const applyUrl = job.apply_url ?? job.url ?? `https://remoteok.com/l/${id}`
      const normalized: NormalizedJob = {
        kind: 'job',
        title: job.position,
        companyName: job.company,
        location: job.location ?? 'Remote',
        remoteType: 'remote',
        employmentType: 'fulltime',
        applyUrl,
        descriptionMd: job.description ?? '',
        techStack: Array.isArray(job.tags) ? job.tags : [],
        postedAt: job.date
          ? new Date(job.date)
          : job.epoch
            ? new Date(job.epoch * 1000)
            : undefined,
        raw: job,
      }
      items.push({ sourceItemId: id, raw: job, normalized })
    }
    return items
  }
}
