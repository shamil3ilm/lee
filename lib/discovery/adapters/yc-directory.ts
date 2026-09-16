import type {
  DiscoveryAdapter,
  DiscoveryItem,
  NormalizedCompany,
} from './types'

interface YcCompany {
  id: number | string
  name: string
  website?: string
  one_liner?: string
  long_description?: string
  batch?: string
  industry?: string
  industries?: string[]
  subindustry?: string
  stage?: string
  status?: string
  team_size?: number | null
  all_locations?: string
  country?: string
  city?: string
  regions?: string[]
  tags?: string[]
}

interface YcResponse {
  companies?: YcCompany[]
}

/**
 * YC Directory adapter — surfaces companies from the public YC directory JSON
 * endpoint. Used for company discovery (not job discovery).
 */
export class YcDirectoryAdapter implements DiscoveryAdapter {
  readonly kind = 'yc_directory'

  async fetch(_config: unknown): Promise<DiscoveryItem[]> {
    const res = await fetch('https://www.ycombinator.com/api/companies', {
      headers: { accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`yc_directory ${res.status}`)
    const body = (await res.json()) as YcResponse | YcCompany[]
    const companies = Array.isArray(body) ? body : body.companies ?? []
    return companies
      .map((c): DiscoveryItem | null => {
        if (!c || !c.name) return null
        const domain = extractDomain(c.website)
        const industries = c.industries ?? (c.industry ? [c.industry] : [])
        const locations = parseLocations(c.all_locations)
        const normalized: NormalizedCompany = {
          kind: 'company',
          name: c.name,
          domain,
          website: c.website,
          description: c.one_liner ?? c.long_description,
          industry: industries,
          size: c.team_size ? bucketSize(c.team_size) : undefined,
          stage: c.stage ?? c.batch,
          hqCountry: c.country,
          hqCity: c.city ?? locations[0],
          officeLocations: locations,
          raw: c,
        }
        return { sourceItemId: String(c.id), raw: c, normalized }
      })
      .filter((x): x is DiscoveryItem => x !== null)
  }
}

function extractDomain(url?: string): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

function parseLocations(s?: string): string[] {
  if (!s) return []
  return s
    .split(/[;,]/)
    .map((p) => p.trim())
    .filter(Boolean)
}

function bucketSize(n: number): string {
  if (n <= 10) return '1-10'
  if (n <= 50) return '11-50'
  if (n <= 250) return '51-250'
  if (n <= 1000) return '251-1000'
  return '1000+'
}
