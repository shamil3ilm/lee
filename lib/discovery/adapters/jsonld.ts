import { z } from 'zod'
import * as cheerio from 'cheerio'
import type { DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'
import { discoveryFetch } from './http'

const configSchema = z.union([
  z.object({ url: z.string().url() }),
  z.object({ urls: z.array(z.string().url()).min(1) }),
])

interface JobPostingLd {
  '@type'?: string | string[]
  identifier?: string | { value?: string }
  title?: string
  description?: string
  datePosted?: string
  employmentType?: string | string[]
  hiringOrganization?: string | { name?: string; sameAs?: string; url?: string }
  jobLocation?:
    | {
        address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string }
      }
    | Array<{
        address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string }
      }>
  applicantLocationRequirements?: unknown
  jobLocationType?: string
  url?: string
  baseSalary?: {
    currency?: string
    value?: { minValue?: number; maxValue?: number; value?: number; unitText?: string }
  }
  skills?: string | string[]
}

/**
 * Extract schema.org JobPosting objects from one or more URLs. Only accepts
 * pages that publish structured JSON-LD markup — no HTML scraping.
 */
export class JsonLdAdapter implements DiscoveryAdapter {
  readonly kind = 'jsonld'

  async fetch(config: unknown): Promise<DiscoveryItem[]> {
    const parsed = configSchema.parse(config)
    const urls = 'urls' in parsed ? parsed.urls : [parsed.url]
    const out: DiscoveryItem[] = []
    for (const url of urls) {
      try {
        const items = await this.fetchOne(url)
        out.push(...items)
      } catch {
        // One bad URL should not fail the whole poll.
      }
    }
    return out
  }

  private async fetchOne(url: string): Promise<DiscoveryItem[]> {
    const res = await discoveryFetch('jsonld', url, { headers: { accept: 'text/html' } })
    if (!res.ok) throw new Error(`jsonld ${res.status}`)
    const html = await res.text()
    const $ = cheerio.load(html)
    const items: DiscoveryItem[] = []
    $('script[type="application/ld+json"]').each((_, el) => {
      const raw = $(el).contents().text().trim()
      if (!raw) return
      let json: unknown
      try {
        json = JSON.parse(raw)
      } catch {
        return
      }
      const postings = collectJobPostings(json)
      for (const p of postings) {
        const item = toDiscoveryItem(p, url)
        if (item) items.push(item)
      }
    })
    return items
  }
}

function collectJobPostings(node: unknown): JobPostingLd[] {
  if (!node) return []
  if (Array.isArray(node)) return node.flatMap((n) => collectJobPostings(n))
  if (typeof node !== 'object') return []
  const obj = node as Record<string, unknown>
  const type = obj['@type']
  const graph = obj['@graph']
  const results: JobPostingLd[] = []
  if (Array.isArray(graph)) {
    results.push(...collectJobPostings(graph))
  }
  const types = Array.isArray(type) ? type : [type]
  if (types.includes('JobPosting')) {
    results.push(obj as JobPostingLd)
  }
  return results
}

function toDiscoveryItem(p: JobPostingLd, sourceUrl: string): DiscoveryItem | null {
  if (!p.title) return null
  const hiring = p.hiringOrganization
  const companyName =
    typeof hiring === 'string' ? hiring : hiring?.name ?? new URL(sourceUrl).hostname
  const website = typeof hiring === 'object' ? hiring?.url ?? hiring?.sameAs : undefined
  const loc = Array.isArray(p.jobLocation) ? p.jobLocation[0] : p.jobLocation
  const locBits = [
    loc?.address?.addressLocality,
    loc?.address?.addressRegion,
    loc?.address?.addressCountry,
  ].filter(Boolean)
  const et = Array.isArray(p.employmentType) ? p.employmentType[0] : p.employmentType
  const employmentType: NormalizedJob['employmentType'] =
    /full/i.test(et ?? '')
      ? 'fulltime'
      : /contract/i.test(et ?? '')
        ? 'contract'
        : /part/i.test(et ?? '')
          ? 'parttime'
          : /intern/i.test(et ?? '')
            ? 'internship'
            : 'unknown'
  const remoteType: NormalizedJob['remoteType'] = /telecommute|remote/i.test(
    p.jobLocationType ?? '',
  )
    ? 'remote'
    : 'unknown'
  const id =
    (typeof p.identifier === 'object' ? p.identifier?.value : p.identifier) ??
    p.url ??
    `${sourceUrl}#${p.title}`
  const applyUrl = p.url ?? sourceUrl
  const salary = p.baseSalary?.value
  const normalized: NormalizedJob = {
    kind: 'job',
    title: p.title,
    companyName,
    companyWebsite: website,
    location: locBits.length > 0 ? locBits.join(', ') : undefined,
    remoteType,
    employmentType,
    applyUrl,
    descriptionMd: p.description ?? '',
    techStack: normalizeSkills(p.skills),
    postedAt: p.datePosted ? new Date(p.datePosted) : undefined,
    salary: salary
      ? {
          min: salary.minValue ?? salary.value,
          max: salary.maxValue ?? salary.value,
          currency: p.baseSalary?.currency,
        }
      : undefined,
    raw: p,
  }
  return { sourceItemId: String(id), raw: p, normalized }
}

function normalizeSkills(s: string | string[] | undefined): string[] {
  if (!s) return []
  if (Array.isArray(s)) return s
  return s.split(/,\s*|\s*\|\s*/).filter(Boolean)
}
