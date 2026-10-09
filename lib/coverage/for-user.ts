import { preferredHit, type PreferredLevel, type PreferredRegion } from '@/lib/regions/preferred'
import { isWithin } from '@/lib/regions/tree'
import { PLAYBOOKS } from './playbooks'
import type { RegionPlaybook } from './playbook-types'

/**
 * The playbook regions a user's preferences touch: every selected target
 * region (GCC → its six countries, Kerala → Kochi, Trivandrum and Calicut),
 * remote unless remote is off, relocation countries, and starred regions
 * first. Pure.
 */

export interface UserRegionPrefs {
  regionIds: readonly string[]
  otherCountries: readonly string[]
  remoteScope: 'worldwide' | 'regions' | 'none'
  preferred: readonly PreferredRegion[]
}

export interface UserPlaybook {
  playbook: RegionPlaybook
  /** The star level covering it, if any. */
  starred: PreferredLevel | null
}

const EU = new Set(['de', 'nl', 'fr', 'es', 'pt', 'it', 'be', 'ch', 'at', 'pl', 'se', 'no', 'dk', 'fi', 'ie'])

function touches(p: RegionPlaybook, selected: readonly string[]): boolean {
  return p.covers.some((c) => selected.some((s) => isWithin(c, s) || isWithin(s, c)))
}

/** Targets with no saved preferences: lee's market (the GCC and India) plus remote. */
const DEFAULT_SELECTION = ['gcc', 'in']

export function playbooksForUser(prefs: UserRegionPrefs): UserPlaybook[] {
  const others = prefs.otherCountries.map((c) => c.toLowerCase())
  const selected = [
    ...(prefs.regionIds.length > 0 ? prefs.regionIds : DEFAULT_SELECTION),
    ...others.filter((c) => !EU.has(c)),
    ...(others.some((c) => EU.has(c)) ? ['europe'] : []),
    ...prefs.preferred.map((p) => p.id),
  ]
  const out: UserPlaybook[] = []
  for (const p of PLAYBOOKS) {
    const isRemote = p.id === 'remote'
    const wanted = isRemote ? prefs.remoteScope !== 'none' : touches(p, selected)
    if (!wanted) continue
    out.push({ playbook: p, starred: preferredHit(p.covers, prefs.preferred)?.level ?? null })
  }
  const rank = (u: UserPlaybook): number => (u.starred === 'top' ? 0 : u.starred === 'preferred' ? 1 : 2)
  return out.sort((a, b) => rank(a) - rank(b) || a.playbook.priority - b.playbook.priority)
}
