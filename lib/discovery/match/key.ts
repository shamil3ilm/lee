import type { MatchProfile } from './types'
import { MATCH_SCORE_VERSION } from './version'

/**
 * Identifies "this profile's ready evidence and preferences under these
 * rules". Stored on every scored row (`fit_key`) and, once a backfill pass
 * finishes, on the profile (`match_applied_key`), so stale rows are found
 * without re-reading the inbox.
 */

/** FNV-1a, 32-bit: a short stable fingerprint (no Node crypto needed). */
function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

const sorted = (xs: Iterable<string>): string[] => [...xs].sort()

export function matchKey(p: MatchProfile): string {
  const canonical = JSON.stringify([
    sorted(p.skills),
    sorted(p.domains),
    fnv1a(p.evidence.join('\n')),
    sorted(p.credentials),
    p.years,
    sorted(p.seniority),
    sorted(p.roleFamilies),
    sorted(p.customRoles.map((r) => r.toLowerCase())),
    sorted(p.regionIds ?? []),
    sorted(p.regions),
    sorted(p.otherCountries),
    p.remoteScope,
    p.remotePref,
    sorted([...p.languages].map(([k, v]) => `${k}:${v}`)),
    p.extra.basedIn,
    sorted(p.extra.sponsorshipFor),
    sorted(p.extra.payFloors.map((f) => `${f.scope}:${f.amount}:${f.currency}:${f.period}`)),
    p.extra.relocationIfSponsored,
    sorted(p.extra.relocationCountries),
  ])
  return `${MATCH_SCORE_VERSION}:${fnv1a(canonical)}`
}
