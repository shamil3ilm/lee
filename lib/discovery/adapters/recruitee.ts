import { z } from 'zod'
import type { DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'
import { discoveryFetch } from './http'
import { employmentTypeOf, toDate } from './prefs'
import { htmlToText } from './html-text'

/**
 * Recruitee public careers API (no key):
 *   GET https://{company}.recruitee.com/api/offers/
 * The slug becomes a hostname, so it must be a single DNS label.
 */

export const DNS_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i
const configSchema = z.object({ company: z.string().regex(DNS_LABEL_RE) })

interface RecruiteeOffer {
  id?: number | string
  slug?: string
  title?: string
  location?: string
  city?: string
  country?: string
  country_code?: string
  remote?: boolean
  hybrid?: boolean
  on_site?: boolean
  careers_url?: string
  published_at?: string
  created_at?: string
  employment_type_code?: string
  company_name?: string
  department?: string
  /** HTML; the offers list carries the full text. */
  description?: string
  requirements?: string
}

/** Recruitee dates look like "2026-09-10 07:25:25 UTC". */
function recruiteeDate(v: string | undefined): Date | undefined {
  if (!v) return undefined
  return toDate(v.replace(' UTC', 'Z').replace(' ', 'T'))
}

export function normalizeRecruiteeOffer(o: RecruiteeOffer, company: string): DiscoveryItem | null {
  if (!o.id || !o.title) return null
  const applyUrl = o.careers_url ?? `https://${company}.recruitee.com/o/${o.slug ?? o.id}`
  const remoteType: NormalizedJob['remoteType'] = o.remote ? 'remote' : o.hybrid ? 'hybrid' : o.on_site ? 'onsite' : 'unknown'
  const raw = { id: o.id, title: o.title, location: o.location, country_code: o.country_code, published_at: o.published_at, department: o.department }
  const normalized: NormalizedJob = {
    kind: 'job',
    title: o.title,
    companyName: o.company_name ?? company,
    location: o.location ?? ([o.city, o.country].filter(Boolean).join(', ') || undefined),
    remoteType,
    employmentType: employmentTypeOf(o.employment_type_code),
    descriptionMd: htmlToText([o.description, o.requirements].filter(Boolean).join('<br>')),
    applyUrl,
    postedAt: recruiteeDate(o.published_at ?? o.created_at),
    techStack: [],
    tags: o.country_code ? [`country:${o.country_code.toLowerCase()}`] : [],
    raw,
  }
  return { sourceItemId: String(o.id), raw, normalized }
}

export class RecruiteeAdapter implements DiscoveryAdapter {
  readonly kind = 'recruitee'

  async fetch(config: unknown): Promise<DiscoveryItem[]> {
    const { company } = configSchema.parse(config)
    const res = await discoveryFetch('recruitee', `https://${company.toLowerCase()}.recruitee.com/api/offers/`, {
      headers: { accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`recruitee ${res.status}`)
    const body = (await res.json()) as { offers?: RecruiteeOffer[] }
    return (body.offers ?? [])
      .map((o) => normalizeRecruiteeOffer(o, company))
      .filter((x): x is DiscoveryItem => x !== null)
  }
}
