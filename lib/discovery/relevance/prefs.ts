import type { UserProfile } from '@/lib/db/queries/profile'
import {
  EMPTY_DISCOVERY_PREFS,
  EXCLUSION_RULES,
  parseDiscoveryPrefs,
  ruleMode,
  type DiscoveryPrefs,
} from './discovery-prefs'
import { isRegionCode, REGION_CODES, type RegionCode } from './places'
import { resolveRoleFamily, SKILL_GROUPS } from './roles'
import { isSeniorityLevel, SENIORITY_LEVELS, type SeniorityLevel } from './seniority'
import { findTerms, normalizeForMatch } from './text'

/**
 * Bump when the gate's rules or alias lists change in a way that should
 * re-evaluate stored discoveries (the key changes → rows are re-gated).
 */
export const RELEVANCE_RULES_VERSION = 'r3'

export type RemoteScope = 'worldwide' | 'regions' | 'none'
export const REMOTE_SCOPES: readonly RemoteScope[] = ['worldwide', 'regions', 'none']

export function isRemoteScope(v: unknown): v is RemoteScope {
  return v === 'worldwide' || v === 'regions' || v === 'none'
}

/**
 * The user's search preferences as the gate reads them, derived from the
 * profile columns: role_types (families), seniority_levels, location_prefs
 * (+ willing_to_relocate_to when relocation is accepted), remote_scope,
 * keywords (include), dealbreakers (exclude) and discovery_prefs (per-rule
 * hard/soft modes, work authorisation, pay floors, languages).
 */
export interface SearchPrefs {
  /** False until the user saves search preferences: filter nothing. */
  active: boolean
  roleFamilies: string[]
  /** Role types that match no family, matched literally against titles. */
  customRoles: string[]
  seniority: SeniorityLevel[]
  regions: RegionCode[]
  /** Other ISO-2 countries the user accepts (relocation targets, extra prefs). */
  otherCountries: string[]
  remoteScope: RemoteScope
  include: string[]
  exclude: string[]
  extra: DiscoveryPrefs
  /** Profile shows container / orchestration / cloud-infra experience. */
  infraExperience: boolean
}

export const EMPTY_PREFS: SearchPrefs = {
  active: false,
  roleFamilies: [],
  customRoles: [],
  seniority: [],
  regions: [],
  otherCountries: [],
  remoteScope: 'worldwide',
  include: [],
  exclude: [],
  extra: EMPTY_DISCOVERY_PREFS,
  infraExperience: false,
}

function clean(list: readonly string[] | null | undefined): string[] {
  const out: string[] = []
  for (const v of list ?? []) {
    const t = typeof v === 'string' ? v.trim() : ''
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t)
  }
  return out
}

/** ISO-2 codes from `location_prefs` entries ({ country: "AE", … }). */
export function countriesFromLocationPrefs(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const entry of value) {
    const c = (entry as { country?: unknown } | null)?.country
    if (typeof c === 'string' && /^[A-Za-z]{2}$/.test(c.trim())) {
      const code = c.trim().toUpperCase()
      if (!out.includes(code)) out.push(code)
    }
  }
  return out
}

type PrefsSource = Pick<
  UserProfile,
  | 'roleTypes'
  | 'seniorityLevels'
  | 'locationPrefs'
  | 'acceptRelocation'
  | 'willingToRelocateTo'
  | 'remoteScope'
  | 'keywords'
  | 'dealbreakers'
  | 'searchPrefsSavedAt'
> &
  Partial<Pick<UserProfile, 'discoveryPrefs' | 'skills' | 'stackWeights'>>

const INFRA = ['docker', 'kubernetes', 'k8s', 'terraform', 'helm', 'aws', 'gcp', 'google cloud', 'azure', 'ecs', 'eks']

function hasInfra(profile: PrefsSource): boolean {
  const weights =
    profile.stackWeights && typeof profile.stackWeights === 'object'
      ? Object.keys(profile.stackWeights as Record<string, unknown>)
      : []
  const text = normalizeForMatch([...(profile.skills ?? []), ...weights].join(' | '))
  return findTerms(text, INFRA).length > 0 && findTerms(text, SKILL_GROUPS.devops).length > 0
}

export function searchPrefsFromProfile(profile: PrefsSource | null | undefined): SearchPrefs {
  if (!profile) return EMPTY_PREFS
  const roleFamilies: string[] = []
  const customRoles: string[] = []
  for (const r of clean(profile.roleTypes)) {
    const fam = resolveRoleFamily(r)
    if (fam) {
      if (!roleFamilies.includes(fam)) roleFamilies.push(fam)
    } else customRoles.push(r)
  }
  const countries = countriesFromLocationPrefs(profile.locationPrefs)
  const relocation = profile.acceptRelocation
    ? clean(profile.willingToRelocateTo)
        .map((c) => c.toUpperCase())
        .filter((c) => /^[A-Z]{2}$/.test(c))
    : []
  const all = [...new Set([...countries, ...relocation])]
  const seniority = SENIORITY_LEVELS.filter((l) => (profile.seniorityLevels ?? []).includes(l))
  return {
    active: profile.searchPrefsSavedAt != null,
    roleFamilies,
    customRoles,
    seniority,
    regions: REGION_CODES.filter((c) => all.includes(c)),
    otherCountries: all.filter((c) => !isRegionCode(c)),
    remoteScope: isRemoteScope(profile.remoteScope) ? profile.remoteScope : 'worldwide',
    include: clean(profile.keywords),
    exclude: clean(profile.dealbreakers),
    extra: parseDiscoveryPrefs(profile.discoveryPrefs),
    infraExperience: hasInfra(profile),
  }
}

/** FNV-1a, 32-bit: a short stable fingerprint (no Node crypto needed). */
function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/**
 * Identifies "these prefs under these rules". Stored on every gated row and
 * on the profile once a full re-evaluation pass finished, so stale rows are
 * found without re-reading the whole inbox. Notice period is display-only
 * and not part of the key.
 */
export function relevanceKey(prefs: SearchPrefs): string {
  if (!prefs.active) return `${RELEVANCE_RULES_VERSION}:off`
  const x = prefs.extra
  const canonical = JSON.stringify([
    [...prefs.roleFamilies].sort(),
    prefs.customRoles.map((r) => r.toLowerCase()).sort(),
    [...prefs.seniority].sort(),
    [...prefs.regions].sort(),
    [...prefs.otherCountries].sort(),
    prefs.remoteScope,
    prefs.include.map((k) => k.toLowerCase()).sort(),
    prefs.exclude.map((k) => k.toLowerCase()).sort(),
    EXCLUSION_RULES.map((r) => ruleMode(x, r)),
    x.basedIn,
    [...x.sponsorshipFor].sort(),
    x.payFloors.map((f) => `${f.scope}:${f.amount}:${f.currency}:${f.period}`).sort(),
    x.languages.map((l) => `${l.name.toLowerCase()}:${l.level}`).sort(),
    prefs.infraExperience,
  ])
  return `${RELEVANCE_RULES_VERSION}:${fnv1a(canonical)}`
}

export function parseSeniorityList(values: readonly unknown[]): SeniorityLevel[] {
  return SENIORITY_LEVELS.filter((l) => values.some((v) => isSeniorityLevel(v) && v === l))
}
