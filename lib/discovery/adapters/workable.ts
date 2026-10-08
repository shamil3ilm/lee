import { z } from 'zod'
import type { DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'
import { discoveryFetch } from './http'
import { htmlToText } from './html-text'

const configSchema = z.object({ company: z.string() })

interface WorkableLocation {
  city?: string
  region?: string
  country?: string
  countryCode?: string
}

interface WorkableJob {
  id?: string
  title: string
  url?: string
  shortcode?: string
  /** v3: an object; widget: absent (flat city / state / country below). */
  location?: WorkableLocation
  city?: string
  state?: string
  country?: string
  locations?: WorkableLocation[]
  published_on?: string
  published?: string
  created_at?: string
  department?: string | string[]
  employment_type?: string
  workplace?: string
  telecommuting?: boolean
  description?: string
  full_title?: string
}

interface WorkableResponse {
  name?: string
  jobs?: WorkableJob[]
  results?: WorkableJob[]
}

function remoteTypeOf(job: WorkableJob): NormalizedJob['remoteType'] {
  const workplace = (job.workplace ?? '').toLowerCase()
  if (workplace === 'remote' || job.telecommuting === true) return 'remote'
  if (workplace === 'hybrid') return 'hybrid'
  if (workplace === 'on_site' || workplace === 'onsite') return 'onsite'
  return 'unknown'
}

function employmentTypeOf(value: string | undefined): NormalizedJob['employmentType'] {
  const et = (value ?? '').toLowerCase()
  if (et.includes('full')) return 'fulltime'
  if (et.includes('contract')) return 'contract'
  if (et.includes('part')) return 'parttime'
  if (et.includes('intern')) return 'internship'
  return 'unknown'
}

function normalize(job: WorkableJob, company: string, companyName: string): DiscoveryItem {
  const first = job.locations?.find((l) => l.city || l.country)
  const loc = job.location ?? (job.city || job.country ? { city: job.city, region: job.state, country: job.country } : first ?? {})
  const locBits = [loc.city, loc.region, loc.country].filter(Boolean)
  const applyUrl =
    job.url ??
    (job.shortcode
      ? `https://apply.workable.com/${company}/j/${job.shortcode}/`
      : `https://apply.workable.com/${company}/`)
  const posted = job.published_on ?? job.published ?? job.created_at
  const countryCode = loc.countryCode ?? job.locations?.[0]?.countryCode
  const normalized: NormalizedJob = {
    kind: 'job',
    title: job.title,
    companyName,
    location: locBits.length > 0 ? locBits.join(', ') : undefined,
    remoteType: remoteTypeOf(job),
    employmentType: employmentTypeOf(job.employment_type),
    applyUrl,
    descriptionMd: htmlToText(job.description),
    techStack: [],
    postedAt: posted ? new Date(posted) : undefined,
    tags: countryCode ? [`country:${countryCode.toLowerCase()}`] : [],
    raw: job,
  }
  return { sourceItemId: job.id ?? job.shortcode ?? applyUrl, raw: job, normalized }
}

/**
 * Workable public job boards. Primary: the widget API
 * (GET www.workable.com/api/accounts/{company}?details=true, redirects to
 * apply.workable.com/api/v1/widget/…) — every published job in one
 * response WITH its description (details=false, used until 2026-10-08,
 * left every description empty), and far less rate-limited than v3. Fallback when the widget
 * errors (other than 404, an unknown account): the v3 list endpoint
 * (POST apply.workable.com/api/v3/accounts/{company}/jobs, page 1).
 */
export class WorkableAdapter implements DiscoveryAdapter {
  readonly kind = 'workable'

  async fetch(config: unknown): Promise<DiscoveryItem[]> {
    const { company } = configSchema.parse(config)
    const slug = encodeURIComponent(company)
    let res = await discoveryFetch('workable', `https://www.workable.com/api/accounts/${slug}?details=true`, {
      headers: { accept: 'application/json' },
    })
    if (!res.ok && res.status !== 404) {
      res = await discoveryFetch('workable', `https://apply.workable.com/api/v3/accounts/${slug}/jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
    }
    if (!res.ok) throw new Error(`workable ${res.status}`)
    const body = (await res.json()) as WorkableResponse
    const jobs = body.jobs ?? body.results ?? []
    const companyName = body.name?.trim() || company
    return jobs.map((job) => normalize(job, company, companyName))
  }
}
