import { z } from 'zod'
import type { DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'
import { discoveryFetch } from './http'
import { employmentTypeOf } from './prefs'
import { htmlToText } from './html-text'
import { DNS_LABEL_RE } from './recruitee'

/**
 * Pinpoint public job board feed (no key):
 *   GET https://{company}.pinpointhq.com/postings.json  →  { data: [...] }
 * No posting date is published (only `deadline_at`). Descriptions come
 * as HTML sections (description, key responsibilities, skills). The slug becomes a hostname, so it must
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
  description?: string
  key_responsibilities?: string
  skills_knowledge_expertise?: string
  compensation_visible?: boolean
  compensation_minimum?: number | null
  compensation_maximum?: number | null
  compensation_currency?: string | null
}

function pinpointText(p: PinpointPosting): string {
  return htmlToText([p.description, p.key_responsibilities, p.skills_knowledge_expertise].filter(Boolean).join('<br>'))
}

function pinpointSalary(p: PinpointPosting): NormalizedJob['salary'] {
  if (!p.compensation_visible || !p.compensation_currency) return undefined
  const min = p.compensation_minimum ?? undefined
  const max = p.compensation_maximum ?? undefined
  return min || max ? { min, max, currency: p.compensation_currency } : undefined
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
    descriptionMd: pinpointText(p),
    applyUrl: p.url,
    techStack: [],
    salary: pinpointSalary(p),
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
