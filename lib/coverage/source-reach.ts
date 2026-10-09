import { DEFAULT_SOURCES, sourceIdentity, type DefaultSource } from '@/lib/defaults/catalog'
import { resolveLocation } from '@/lib/regions/normalize'
import { isRegionId, isWithin } from '@/lib/regions/tree'

/**
 * Which regions a job source can yield, from its kind and (for a company
 * board) the employer's country in the starter catalog. Client-safe, pure.
 *
 *   region  a source that lists this region's jobs (an employer board, an IT park)
 *   broad   a search API or remote board that can include the region
 *   setup   yields any region once the user sets it up (alert e-mails,
 *           Google Alerts, LinkedIn posts, pasted links)
 */

export type Reach = 'region' | 'broad' | 'setup'

export interface SourceReach {
  reach: Reach
  /** Region-taxonomy ids; empty when unknown. "*" = any region (setup sources). */
  regions: readonly string[]
}

const KIND_REACH: Readonly<Record<string, SourceReach>> = {
  himalayas: { reach: 'broad', regions: ['gcc', 'in', 'remote'] },
  remoteok: { reach: 'broad', regions: ['remote'] },
  weworkremotely: { reach: 'broad', regions: ['remote'] },
  remotive: { reach: 'broad', regions: ['remote'] },
  workingnomads: { reach: 'broad', regions: ['remote'] },
  jobicy: { reach: 'broad', regions: ['ae', 'remote'] },
  hn_whoishiring: { reach: 'broad', regions: ['remote', 'us', 'europe'] },
  adzuna: { reach: 'broad', regions: ['in'] },
  technopark: { reach: 'region', regions: ['thiruvananthapuram'] },
  infopark: { reach: 'region', regions: ['kochi'] },
  cyberpark: { reach: 'region', regions: ['kozhikode'] },
  ul_cyberpark: { reach: 'region', regions: ['kozhikode'] },
  ksum: { reach: 'region', regions: ['kerala'] },
  email_alert: { reach: 'setup', regions: ['*'] },
  google_alerts: { reach: 'setup', regions: ['*'] },
  linkedin_post: { reach: 'setup', regions: ['*'] },
  manual_import: { reach: 'setup', regions: ['*'] },
}

/** Kinds that read one employer's board (or one feed): their region is the employer's. */
const BOARD_KINDS = new Set([
  'greenhouse', 'lever', 'ashby', 'workable', 'recruitee', 'pinpoint', 'workday', 'oracle_orc', 'successfactors', 'phenom', 'rss', 'jsonld',
])

/** Country name → region id ("United Arab Emirates" → "ae"). */
export function countryIdOf(name: string | undefined): string | null {
  if (!name) return null
  const id = resolveLocation(name).places[0]?.id
  return id && isRegionId(id) ? id : null
}

/** The regions a starter-catalog source yields: its explicit list, else its employer's country. */
export function defaultSourceRegions(d: DefaultSource): string[] {
  if (d.regions && d.regions.length > 0) return [...d.regions]
  const c = countryIdOf(d.company?.headquartersCountry)
  return c ? [c] : []
}

const CATALOG_BY_IDENTITY: ReadonlyMap<string, DefaultSource> = new Map(
  DEFAULT_SOURCES.map((d) => [sourceIdentity(d.kind, d.config), d] as const),
)

export function catalogEntryFor(kind: string, config: Record<string, unknown>): DefaultSource | undefined {
  return CATALOG_BY_IDENTITY.get(sourceIdentity(kind, config))
}

export function sourceReach(kind: string, config: Record<string, unknown>): SourceReach | null {
  const known = KIND_REACH[kind]
  if (known) return known
  if (!BOARD_KINDS.has(kind)) return null
  const d = catalogEntryFor(kind, config)
  const regions = d ? defaultSourceRegions(d) : []
  return { reach: 'region', regions }
}

/**
 * How a source's regions relate to a region's covers: "region" when one
 * lies inside a cover (Infopark → Kochi), "broad" when it is wider (GCC →
 * Kuwait) or the source is broad, null when unrelated.
 */
export function reachFor(reach: SourceReach | null, covers: readonly string[]): Reach | null {
  if (!reach) return null
  if (reach.regions.includes('*')) return 'setup'
  // A source made for exactly this region (remote boards for Remote) is region-specific.
  if (reach.regions.some((r) => covers.includes(r))) return 'region'
  let best: Reach | null = null
  for (const r of reach.regions) {
    if (covers.some((c) => isWithin(r, c))) {
      if (reach.reach === 'region') return 'region'
      best = 'broad'
    } else if (covers.some((c) => isWithin(c, r))) best = 'broad'
  }
  return best
}
