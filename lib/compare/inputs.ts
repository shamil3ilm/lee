import { scanPlaces } from '@/lib/discovery/relevance/places'
import type { CompanyFacts, ConfirmedSummary, ReputationSignal, UserRating } from '@/lib/reputation/types'
import type { Place } from './types'

/**
 * What the comparison knows about one opportunity (a discovery or a saved
 * application) and about the user, already loaded. Pure data: the service
 * (lib/compare/service.ts) fills it, the rules only read it.
 */

export type OpportunityKind = 'discovery' | 'application'

export interface ReputationInput {
  companyId: string
  ratings: readonly UserRating[]
  summary: ConfirmedSummary | null
  facts: CompanyFacts | null
  signals: readonly ReputationSignal[]
}

export interface OpportunityInput {
  /** "d:<uuid>" for a discovery, "a:<uuid>" for an application. */
  key: string
  kind: OpportunityKind
  id: string
  title: string
  companyName: string | null
  location: string | null
  remoteType: string | null
  employmentType: string | null
  description: string | null
  salary: { min?: number; max?: number; currency?: string } | null
  /** jobs.benefits (parsed details); {} for discoveries. */
  structuredBenefits: unknown
  techStack: readonly string[]
  url: string | null
  /** Where the comparison links back to (the detail page). */
  href: string
  /** The description is one the user pasted (discoveries only). */
  jdPasted?: boolean
  reputation: ReputationInput | null
}

export interface ProfileContext {
  /** Skill names from the master profile and the profile's skill list. */
  skills: readonly string[]
  /** Labels of study-list items (ai-assisted or still learning). */
  studyLabels: readonly string[]
  /** Résumé text used for domain fit (headline, summary, work keywords). */
  domainText: string
}

export function opportunityKey(kind: OpportunityKind, id: string): string {
  return `${kind === 'discovery' ? 'd' : 'a'}:${id}`
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Parse "d:<uuid>" / "a:<uuid>"; null for anything else. */
export function parseOpportunityKey(raw: string): { kind: OpportunityKind; id: string } | null {
  const m = /^([da]):(.+)$/.exec(raw.trim())
  if (!m || !UUID_RE.test(m[2]!)) return null
  return { kind: m[1] === 'd' ? 'discovery' : 'application', id: m[2]!.toLowerCase() }
}

/** At most `max` distinct valid keys from "?ids=d:…,a:…". */
export function parseOpportunityKeys(raw: string | string[] | undefined, max = 3): string[] {
  const list = (Array.isArray(raw) ? raw.join(',') : (raw ?? '')).split(',')
  const keys: string[] = []
  for (const item of list) {
    const p = parseOpportunityKey(item)
    if (!p) continue
    const key = opportunityKey(p.kind, p.id)
    if (!keys.includes(key)) keys.push(key)
    if (keys.length >= max) break
  }
  return keys
}

/**
 * Where the job is: the first target region its location names; a remote
 * job keeps you where you are; another named place is "elsewhere".
 */
export function placeOf(
  location: string | null,
  remoteType: string | null,
  currentPlace: Place | null,
): { place: Place | null; remote: boolean } {
  const scan = scanPlaces(location, { trustCodes: true })
  const region = [...scan.regions][0]
  const remote = remoteType === 'remote'
  if (region && !remote) return { place: region, remote }
  if (remote) return { place: currentPlace, remote }
  if (region) return { place: region, remote }
  if (scan.foreign.size > 0) return { place: 'OTHER', remote }
  return { place: null, remote }
}
