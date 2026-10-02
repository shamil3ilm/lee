import { z } from 'zod'
import type { DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'
import { discoveryFetch } from './http'
import { employmentTypeOf } from './prefs'
import { DNS_LABEL_RE } from './recruitee'

/**
 * Pinpoint public job board feed (no key):
 *   GET https://{company}.pinpointhq.com/postings.json  →  { data: [...] }
 * No posting date is published. The slug becomes a hostname, so it must
 * be a single DNS label. Config: { company, displayName? }.
 */

const configSchema = z.object({
  company: z.string().regex(DNS_LABEL_RE),
  displayName: z.string().max(100).optional(),
})

interface PinpointPosting {
  id?: string | number
  title?: string
  url?: string
  employment_type?: string
  workplace_type?: string
  location?: { city?: string; name?: string; province?: string }
  job?: { department?: { name?: string } }
}

function titleCase(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1)
}

export function normalizePinpointPosting(p: PinpointPosting, company: string, displayName?: string): DiscoveryItem | null {
  if (!p.id || !p.title || !p.url) return null
  const workplace = (p.workplace_type ?? '').toLowerCase()
  const remoteType: NormalizedJob['remoteType'] =
    workplace === 'remote' ? 'remote' : workplace === 'hybrid' ? 'hybrid' : workplace === 'onsite' ? 'onsite' : 'unknown'
  const location = [p.location?.city, p.location?.name].filter(Boolean).join(', ') || undefined
  const raw = { id: p.id, title: p.title, url: p.url, workplace_type: p.workplace_type, location: p.location, department: p.job?.department?.name }
  const normalized: NormalizedJob = {
    kind: 'job',
    title: p.title.replace(/\.$/, ''),
    companyName: displayName ?? titleCase(company),
    location,
    remoteType,
    employmentType: employmentTypeOf(p.employment_type),
    descriptionMd: '',
    applyUrl: p.url,
    techStack: [],
    raw,
  }
  return { sourceItemId: String(p.id), raw, normalized }
}

export class PinpointAdapter implements DiscoveryAdapter {
  readonly kind = 'pinpoint'

  async fetch(config: unknown): Promise<DiscoveryItem[]> {
    const { company, displayName } = configSchema.parse(config)
    const res = await discoveryFetch('pinpoint', `https://${company.toLowerCase()}.pinpointhq.com/postings.json`, {
      headers: { accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`pinpoint ${res.status}`)
    const body = (await res.json()) as { data?: PinpointPosting[] }
    return (body.data ?? [])
      .map((p) => normalizePinpointPosting(p, company, displayName))
      .filter((x): x is DiscoveryItem => x !== null)
  }
}
