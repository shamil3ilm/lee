import type { NewUserProfile, UserProfile } from '@/lib/db/queries/profile'
import {
  discoveryPrefsSchema,
  SHARE_FACTS,
  EXCLUSION_RULES,
  LANGUAGE_LEVELS,
  NOTICE_PERIODS,
  RULE_MODES,
  type DiscoveryPrefs,
  type PayFloor,
} from './discovery-prefs'
import { isRegionCode, REGION_CODES } from './places'
import { isRemoteScope } from './prefs'
import { migrateLegacyRegions, selectionCountries } from '@/lib/regions/selection'
import { SETTINGS_ROOTS } from '@/lib/regions/taxonomy'
import { anyWithin } from '@/lib/regions/tree'
import { ROLE_FAMILY_IDS } from './roles'
import { SENIORITY_LABELS, SENIORITY_LEVELS } from './seniority'
import { isWorkMode } from './work-mode'
import { parsePreferredValues } from '@/lib/regions/preferred'

/**
 * Search-preferences form → profile patch. Validates every field against
 * the fixed option lists; unknown values are dropped, never stored.
 */

const ISO2 = /^[A-Z]{2}$/

function all(fd: FormData, name: string): string[] {
  return fd.getAll(name).filter((v): v is string => typeof v === 'string')
}

function csv(fd: FormData, name: string, max = 30): string[] {
  const v = fd.get(name)
  if (typeof v !== 'string') return []
  const out: string[] = []
  for (const part of v.split(',')) {
    const t = part.trim().slice(0, 60)
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t)
  }
  return out.slice(0, max)
}

function isoList(values: readonly string[]): string[] {
  return [...new Set(values.map((c) => c.trim().toUpperCase()).filter((c) => ISO2.test(c)))]
}

function positive(fd: FormData, name: string): number | null {
  const v = fd.get(name)
  if (typeof v !== 'string' || v.trim() === '') return null
  const n = Number(v.replace(/,/g, ''))
  return Number.isFinite(n) && n > 0 && n < 1_000_000_000 ? n : null
}

interface LocationPref {
  country: string
  cities?: string[]
  region?: string
  priority?: number
}

/**
 * Selected countries → location_prefs, keeping cities/priority of entries
 * the user already had for a kept country.
 */
export function mergeLocationPrefs(existing: unknown, countries: readonly string[]): LocationPref[] {
  const prior = Array.isArray(existing) ? (existing as LocationPref[]) : []
  const out: LocationPref[] = []
  for (const c of countries) {
    const kept = prior.filter((p) => typeof p?.country === 'string' && p.country.toUpperCase() === c)
    out.push(...(kept.length > 0 ? kept : [{ country: c, cities: [], priority: 1 }]))
  }
  return out
}

function payFloors(fd: FormData): PayFloor[] {
  const floors: PayFloor[] = []
  const gcc = positive(fd, 'payGccMonthlyAed')
  if (gcc) floors.push({ scope: 'GCC', amount: gcc, currency: 'AED', period: 'month' })
  const lpa = positive(fd, 'payIndiaLpa')
  if (lpa) floors.push({ scope: 'IN', amount: Math.round(lpa * 100_000), currency: 'INR', period: 'year' })
  return floors
}

function languages(fd: FormData): DiscoveryPrefs['languages'] {
  const names = all(fd, 'langName')
  const levels = all(fd, 'langLevel')
  const out: DiscoveryPrefs['languages'] = []
  names.forEach((name, i) => {
    const n = name.trim().slice(0, 40)
    const level = levels[i]
    if (!n || !(LANGUAGE_LEVELS as readonly string[]).includes(level ?? '')) return
    if (out.some((l) => l.name.toLowerCase() === n.toLowerCase())) return
    out.push({ name: n, level: level as DiscoveryPrefs['languages'][number]['level'] })
  })
  return out.slice(0, 12)
}

export function discoveryPrefsFromForm(fd: FormData): DiscoveryPrefs {
  const rules: Record<string, string> = {}
  for (const r of EXCLUSION_RULES) {
    const v = fd.get(`rule_${r}`)
    if (typeof v === 'string' && (RULE_MODES as readonly string[]).includes(v)) rules[r] = v
  }
  const basedIn = typeof fd.get('basedIn') === 'string' ? String(fd.get('basedIn')).toUpperCase() : ''
  return discoveryPrefsSchema.parse({
    rules,
    basedIn: ISO2.test(basedIn) ? basedIn : null,
    sponsorshipFor: isoList(all(fd, 'sponsorshipFor')),
    payFloors: payFloors(fd),
    languages: languages(fd),
    noticePeriods: all(fd, 'notice').filter((n) => (NOTICE_PERIODS as readonly string[]).includes(n)),
    relocationIfSponsored: fd.get('relocationIfSponsored') === 'on',
    relocationCountries: [
      ...new Set(csv(fd, 'relocationCountries').map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c))),
    ],
    // Checkboxes: an unchecked box is absent, so it reads as "don't share".
    share: Object.fromEntries(SHARE_FACTS.map((f) => [f, fd.get(`share_${f}`) === 'on'])),
    // Starred regions ("kw:top", "ae:preferred"): a ranking boost only.
    preferredRegions: parsePreferredValues(all(fd, 'preferredRegion')),
    companyStages: all(fd, 'companyStage').filter((s) => s === 'startup' || s === 'scaleup' || s === 'enterprise'),
    growthInFit: fd.get('growthInFit') === 'on',
  })
}

/**
 * Target regions posted as node ids ("gcc", "kerala", "dubai"); legacy
 * country codes ("AE", "IN") still map. Only GCC and India nodes are
 * target regions; other countries have their own field.
 */
export function targetRegionsFromForm(fd: FormData): string[] {
  return migrateLegacyRegions(all(fd, 'region')).filter((id) => SETTINGS_ROOTS.some((root) => anyWithin([id], root)))
}

export function searchPrefsPatch(fd: FormData, existing: UserProfile | null, now: Date = new Date()): Partial<NewUserProfile> {
  const families = all(fd, 'roleFamily').filter((f) => ROLE_FAMILY_IDS.includes(f))
  const targetRegions = targetRegionsFromForm(fd)
  const touched = selectionCountries(targetRegions)
  const others = isoList(csv(fd, 'otherCountries')).filter((c) => !isRegionCode(c))
  const remote = fd.get('remoteScope')
  const countries = [...REGION_CODES.filter((c) => touched.includes(c)), ...others]
  const levels = SENIORITY_LEVELS.filter((l) => all(fd, 'seniority').includes(l))
  const top = levels[levels.length - 1]
  const workMode = fd.get('remotePref')
  return {
    roleTypes: [...families, ...csv(fd, 'customRoles', 10)],
    seniorityLevels: levels,
    // One place to edit seniority and work mode (Settings › Search): the
    // free-text profile seniority is derived from the highest level picked,
    // so source queries and AI prompts that read it stay in step.
    seniority: top ? SENIORITY_LABELS[top] : null,
    remotePref: isWorkMode(workMode) ? workMode : 'any',
    targetRegions,
    // Country-level copy for the source queries and AI prompts that read countries.
    locationPrefs: mergeLocationPrefs(existing?.locationPrefs, countries) as NewUserProfile['locationPrefs'],
    remoteScope: isRemoteScope(remote) ? remote : 'worldwide',
    acceptRelocation: fd.get('acceptRelocation') === 'on',
    willingToRelocateTo: isoList(csv(fd, 'willingToRelocateTo')),
    keywords: csv(fd, 'keywords'),
    dealbreakers: csv(fd, 'dealbreakers'),
    discoveryPrefs: discoveryPrefsFromForm(fd) as NewUserProfile['discoveryPrefs'],
    searchPrefsSavedAt: now,
  }
}
