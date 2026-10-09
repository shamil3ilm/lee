import { expandSelection } from '@/lib/regions/selection'
import { withAncestors } from '@/lib/regions/tree'
import { brandKey, countryKey, domainOf } from '../normalize'
import type { CompanyCandidate } from '../types'
import { KSA_SEED, KUWAIT_SEED, QATAR_SEED, UAE_SEED } from './gcc'
import { KERALA_SEED } from './kerala'
import type { SeedCompany } from './types'

export type { SeedCompany } from './types'

/**
 * The seed catalog: well-known tech employers per priority region
 * (versioned data in ./kerala.ts and ./gcc.ts).
 *
 * MAINTENANCE: the seed is a floor, not the ceiling. It exists so that a
 * famous employer is never missed because a directory lists it under a
 * legal name or not at all; the IT-park lists, chamber directories, GitHub
 * orgs, job postings and your connections are what find everyone else. Add a
 * company only with public facts, run `pnpm tsx scripts/company-seed-verify.ts`
 * and bump its `checkedOn`. A seed entry never adds fit or growth points.
 */

export const SEED_COMPANIES: readonly SeedCompany[] = [...KERALA_SEED, ...UAE_SEED, ...KUWAIT_SEED, ...KSA_SEED, ...QATAR_SEED]

export const SEED_TAG = 'seed'

function toCandidate(s: SeedCompany): CompanyCandidate {
  return {
    name: s.name,
    website: s.website,
    regionIds: [...s.regionIds],
    industries: [...s.industries],
    sourceTags: [SEED_TAG],
    evidence: {},
  }
}

/**
 * Seed companies with an office inside the target places (a seed city lies
 * in a selected country or city, or is itself selected).
 */
export function seedCandidates(placeIds: readonly string[]): CompanyCandidate[] {
  const wanted = new Set(expandSelection(placeIds))
  return SEED_COMPANIES.filter((s) => s.regionIds.some((r) => wanted.has(r) || withAncestors([r]).some((a) => placeIds.includes(a)))).map(toCandidate)
}

interface AliasHit {
  seed: SeedCompany
  country: string
}

/** brand key of every seed name and alias → the seed entry (per country it has an office in). */
const ALIASES: ReadonlyMap<string, AliasHit> = (() => {
  const m = new Map<string, AliasHit>()
  for (const s of SEED_COMPANIES) {
    const countries = new Set(s.regionIds.map((r) => countryKey([r])))
    for (const n of [s.name, ...(s.aliases ?? [])]) {
      for (const country of countries) m.set(`${brandKey(n)}:${country}`, { seed: s, country })
    }
  }
  return m
})()

/** The seed entry a listed name stands for in that country ("Good Methods Software Solutions (P) Ltd" in India → CareStack). */
export function seedFor(name: string, regionIds: readonly string[]): SeedCompany | null {
  return ALIASES.get(`${brandKey(name)}:${countryKey(regionIds)}`)?.seed ?? null
}

/** The seed entry a typed name stands for, in any country (the search box). */
export function seedByName(name: string): SeedCompany | null {
  const k = brandKey(name)
  if (k.length < 2) return null
  return SEED_COMPANIES.find((s) => [s.name, ...(s.aliases ?? [])].some((n) => brandKey(n) === k)) ?? null
}

/**
 * A name-only directory listing that is a seed company under another name
 * takes the seed's name and website (so it dedupes by domain); the listed
 * name is kept as evidence. Candidates with their own website are left as
 * they are.
 */
export function applySeedAliases(list: readonly CompanyCandidate[]): CompanyCandidate[] {
  return list.map((c) => {
    if (domainOf(c.website)) return c
    const s = seedFor(c.name, c.regionIds)
    if (!s) return c
    return {
      ...c,
      name: s.name,
      website: s.website,
      evidence: { ...c.evidence, ...(c.name !== s.name ? { listedAs: c.name.slice(0, 120) } : {}) },
    }
  })
}
