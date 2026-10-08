import type { UserProfile } from '@/lib/db/queries/profile'
import { experienceMonths } from '@/lib/cv-score/career'
import { evidenceOf, isSkillBacked } from '@/lib/resume/readiness'
import { readResumeProfile, type ResumeProfile } from '@/lib/resume/types'
import { LANGUAGE_LEVELS, type LanguageLevel } from '../relevance/discovery-prefs'
import { searchPrefsFromProfile } from '../relevance/prefs'
import { findTerms, normalizeForMatch } from '../relevance/text'
import { canonicalSkill, skillsInText, withImplied } from './lexicon'
import type { MatchProfile } from './types'

/**
 * The user's side of the Match Score, from READY evidence only:
 *   - résumé skills that are interview-ready or backed by a ready item
 *     (lib/resume/readiness: isSkillBacked);
 *   - skills named by interview-ready work and projects;
 *   - domain skills (payments, e-invoicing) also from domain-ready items.
 * Not-ready (learning / AI-assisted) items never count. Without a stored
 * résumé the legacy settings skills are used (they seed the résumé as
 * "own", i.e. ready).
 */

export type ProfileSource = Pick<
  UserProfile,
  | 'skills'
  | 'stackWeights'
  | 'yearsExperience'
  | 'remotePref'
  | 'resume'
  | 'roleTypes'
  | 'seniorityLevels'
  | 'locationPrefs'
  | 'acceptRelocation'
  | 'willingToRelocateTo'
  | 'remoteScope'
  | 'keywords'
  | 'dealbreakers'
  | 'searchPrefsSavedAt'
  | 'discoveryPrefs'
>

export const PAYMENTS_TERMS = [
  'payments', 'payment gateway', 'payment gateways', 'payment processing', 'payment integration',
  'payment integrations', 'fintech', 'stripe', 'paytabs', 'checkout.com', 'adyen', 'telr', 'ach',
  'nacha', 'wallet', 'wallets', 'remittance', 'remittances', 'payouts', 'card issuing', 'acquiring',
  'open banking', 'pci dss', 'pci-dss', 'reconciliation', 'cheque', 'cheques', 'e-check', 'e-checks',
  'bnpl', 'buy now pay later',
] as const

export const EINVOICING_TERMS = [
  'zatca', 'fatoora', 'e-invoicing', 'einvoicing', 'e-invoice', 'e-invoices', 'electronic invoicing',
  'electronic invoice', 'peppol', 'xades', 'ubl', 'en 16931', 'en16931', 'fta e-invoicing',
  'الفوترة الإلكترونية', 'فاتورة',
] as const

const LEVEL_RANK = new Map(LANGUAGE_LEVELS.map((l, i) => [l, i] as const))

function readySkillNames(resume: ResumeProfile): { tech: string[]; domain: string[] } {
  const evidence = evidenceOf(resume)
  const tech: string[] = []
  const domain: string[] = []
  for (const g of resume.skills) {
    for (const s of g.skills) {
      if (!isSkillBacked(s, evidence)) continue
      if (s.kind === 'domain') domain.push(s.name)
      else tech.push(s.name)
    }
  }
  return { tech, domain }
}

function skillSet(names: readonly string[], evidenceText: string): Set<string> {
  const out = new Set<string>()
  for (const n of names) {
    const c = canonicalSkill(n)
    if (c) out.add(c)
  }
  for (const c of skillsInText(evidenceText)) out.add(c)
  return withImplied(out)
}

/** Whole years across résumé roles (overlaps merged), or null without dated roles. */
export function resumeYears(resume: ResumeProfile | null, now: Date): number | null {
  if (!resume) return null
  const toMonth = (d: string): string | undefined => (d ? (d.length >= 7 ? d.slice(0, 7) : `${d}-01`) : undefined)
  const roles = resume.work
    .filter((w) => w.startDate)
    .map((w) => ({ company: w.name, title: w.position, start: toMonth(w.startDate), end: toMonth(w.endDate) ?? 'present', bullets: [] }))
  if (roles.length === 0) return null
  return Math.floor(experienceMonths(roles, now) / 12)
}

function languagesOf(resume: ResumeProfile | null, prefs: ReturnType<typeof searchPrefsFromProfile>): Map<string, LanguageLevel> {
  const out = new Map<string, LanguageLevel>()
  const add = (name: string, level: LanguageLevel): void => {
    const key = normalizeForMatch(name)
    const prev = out.get(key)
    if (!prev || (LEVEL_RANK.get(level) ?? 0) > (LEVEL_RANK.get(prev) ?? 0)) out.set(key, level)
  }
  for (const l of resume?.languages ?? []) add(l.language, l.fluency)
  for (const l of prefs.extra.languages) add(l.name, l.level)
  return out
}

function domainsOf(text: string): Set<string> {
  const out = new Set<string>()
  if (findTerms(text, PAYMENTS_TERMS).length > 0) out.add('payments')
  if (findTerms(text, EINVOICING_TERMS).length > 0) out.add('einvoicing')
  return out
}

export function matchProfileFrom(profile: ProfileSource | null, now: Date = new Date()): MatchProfile {
  const prefs = searchPrefsFromProfile(profile)
  const resume = readResumeProfile(profile?.resume)
  let skills: Set<string>
  let domainText: string
  if (resume) {
    const evidence = evidenceOf(resume)
    const names = readySkillNames(resume)
    skills = skillSet(names.tech, evidence.full)
    domainText = normalizeForMatch([evidence.full, evidence.domain, ...names.tech, ...names.domain].join(' | '))
  } else {
    const weights = profile?.stackWeights && typeof profile.stackWeights === 'object' ? Object.keys(profile.stackWeights) : []
    const names = [...(profile?.skills ?? []), ...weights]
    skills = skillSet(names, '')
    domainText = normalizeForMatch(names.join(' | '))
  }
  return {
    skills,
    domains: domainsOf(domainText),
    years: profile?.yearsExperience ?? resumeYears(resume, now),
    seniority: prefs.seniority,
    roleFamilies: prefs.roleFamilies,
    customRoles: prefs.customRoles,
    regions: prefs.regions,
    otherCountries: prefs.otherCountries,
    remoteScope: prefs.remoteScope,
    remotePref: profile?.remotePref ?? 'any',
    languages: languagesOf(resume, prefs),
    extra: { basedIn: prefs.extra.basedIn, sponsorshipFor: prefs.extra.sponsorshipFor, payFloors: prefs.extra.payFloors },
    prefsActive: prefs.active,
  }
}
