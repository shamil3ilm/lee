import { LANGUAGE_LEVELS, ruleMode, type ExclusionRule, type LanguageLevel } from './discovery-prefs'
import { assessPay, floorFor, parsePostedPay } from './pay'
import { regionLabel, type RegionCode } from './places'
import type { SearchPrefs } from './prefs'
import { SKILL_GROUPS } from './roles'
import {
  detectContract,
  detectLanguages,
  detectNationalsOnly,
  detectPresenceRequired,
  detectPureSupport,
  detectSales,
  detectShifts,
  detectVisaOffered,
} from './signals'
import { findTerms, normalizeForMatch } from './text'

/**
 * Per-rule exclusions the user sets to hard (→ Filtered out), soft (→ stays
 * in the inbox, ranked lower, with a chip) or off; plus boosts and neutral
 * info chips. Pay below the user's range is ALWAYS soft (never filtered);
 * "be in the country" wording is info only (a visit visa is an option).
 */

export interface SoftRuleInput {
  title: string
  description: string
  employmentType?: string | null
  salary?: { min?: number; max?: number; currency?: string } | null
  /** Target regions the posting is located in (explicit places only). */
  regions: ReadonlySet<RegionCode>
  remote: boolean
  families: readonly string[]
}

export interface SoftRuleResult {
  hard: string[]
  penalties: string[]
  boosts: string[]
  /** Neutral facts shown as chips; no effect on rank. */
  infos: string[]
}

/** Points per soft outcome, added to the inbox ranking. */
export const PENALTY_POINTS = 15
export const BOOST_POINTS = 5

export function rankAdjust(r: Pick<SoftRuleResult, 'penalties' | 'boosts'>): number {
  const v = r.boosts.length * BOOST_POINTS - r.penalties.length * PENALTY_POINTS
  return Math.max(-60, Math.min(20, v))
}

const LEVEL_RANK = new Map(LANGUAGE_LEVELS.map((l, i) => [l, i] as const))
const PROFESSIONAL = LEVEL_RANK.get('professional') ?? 2

type Add = (rule: ExclusionRule, label: string | null) => void

export function applySoftRules(input: SoftRuleInput, prefs: SearchPrefs): SoftRuleResult {
  const out: SoftRuleResult = { hard: [], penalties: [], boosts: [], infos: [] }
  const add: Add = (rule, label) => {
    if (!label) return
    const mode = ruleMode(prefs.extra, rule)
    if (mode === 'hard') out.hard.push(label)
    else if (mode === 'soft') out.penalties.push(label)
  }
  const text = { title: input.title, description: input.description, employmentType: input.employmentType }
  add('sales', detectSales(text))
  add('contract', detectContract(text))
  add('shifts', detectShifts(text))
  add('support', detectPureSupport(text))
  visaRules(input, prefs, add, out)
  languageRules(input, prefs, add, out)
  payRule(input, prefs, out)
  devopsHeavy(input, prefs, out)
  return out
}

function presenceCountry(regions: ReadonlySet<RegionCode>): string {
  const first = [...regions].find((r) => r !== 'IN')
  return first ? regionLabel(first) : 'the country'
}

/**
 * Work authorisation for on-site/hybrid postings in a region where the user
 * needs sponsorship: "visa provided" boosts; "nationals only" is the one
 * mismatch (rule `visa`); "must be in UAE / own visa / local candidates" is
 * an info chip only.
 */
function visaRules(input: SoftRuleInput, prefs: SearchPrefs, add: Add, out: SoftRuleResult): void {
  const nationals = detectNationalsOnly(input.description)
  if (nationals) add('visa', `visa: ${nationals}`)
  const { sponsorshipFor, basedIn } = prefs.extra
  if (input.remote) return
  const needs = [...input.regions].some((r) => sponsorshipFor.includes(r) && r !== basedIn)
  if (!needs) return
  const offered = detectVisaOffered(input.description)
  if (offered) out.boosts.push(offered)
  else if (detectPresenceRequired(input.description)) {
    out.infos.push(`Needs presence in ${presenceCountry(input.regions)} — visit visa possible`)
  }
}

function levelOf(prefs: SearchPrefs, language: string): LanguageLevel | null {
  const hit = prefs.extra.languages.find((l) => normalizeForMatch(l.name) === language)
  return hit?.level ?? null
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function languageRules(input: SoftRuleInput, prefs: SearchPrefs, add: Add, out: SoftRuleResult): void {
  // Without a language list we cannot tell a mismatch from a match.
  if (prefs.extra.languages.length === 0) return
  for (const m of detectLanguages(input)) {
    if (m.language === 'english') continue
    const level = levelOf(prefs, m.language)
    const rank = level ? (LEVEL_RANK.get(level) ?? 0) : -1
    if (rank >= PROFESSIONAL) out.boosts.push(`language: ${titleCase(m.language)}`)
    else if (m.required) add('language', `language: ${titleCase(m.language)} required (you: ${level ?? 'none'})`)
  }
}

/** Pay: shown as info when stated; below the user's range → ranked lower, never filtered. */
function payRule(input: SoftRuleInput, prefs: SearchPrefs, out: SoftRuleResult): void {
  const pay = parsePostedPay({ salary: input.salary, description: input.description })
  if (!pay) return
  const floor = floorFor(prefs.extra.payFloors, input.regions)
  const { figure, below } = assessPay(pay, floor)
  if (below) out.penalties.push(`pay: ${figure}, below your range`)
  else out.infos.push(`pay: ${figure}`)
}

/**
 * A backend posting whose core ask is DevOps/cloud infra, for a profile with
 * no infra experience: a weaker match (never filtered, unless its title is
 * DevOps/SRE, which the role rule handles).
 */
function devopsHeavy(input: SoftRuleInput, prefs: SearchPrefs, out: SoftRuleResult): void {
  if (prefs.infraExperience || input.families.includes('devops')) return
  const hits = findTerms(normalizeForMatch(input.description.slice(0, 8_000)), SKILL_GROUPS.devops)
  if (hits.length >= 5) out.penalties.push(`DevOps-heavy (${hits.slice(0, 3).join(', ')})`)
}
