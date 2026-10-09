import * as companiesQ from '@/lib/db/queries/localCompanies'
import * as profileQ from '@/lib/db/queries/profile'
import { getMasterCV } from '@/lib/documents/master'
import type { MasterCV } from '@/lib/documents/types'
import { loadApplicationFacts } from '@/lib/apply/application-facts-service'
import { searchPrefsFromProfile } from '@/lib/discovery/relevance/prefs'
import { normalizeForMatch } from '@/lib/discovery/relevance/text'
import { SKILL_GROUPS } from '@/lib/discovery/relevance/roles'
import { referralHint } from '@/lib/integrations/linkedin/connections'
import { placeName } from '@/lib/regions/display'
import { countryOf } from '@/lib/regions/tree'
import { variantSummaries } from '@/lib/variants/service'
import { suggestVariant } from '@/lib/variants/suggest'
import type { AIProvider } from '@/lib/ai/types'
import { logger } from '@/lib/logger'
import { INDUSTRY_FAMILIES, isIndustry, type Industry } from './industry'
import { lockedDraft, type SpeculativeChannel, type SpeculativeContact, type SpeculativeDraft, type SpeculativeFacts } from './outreach'
import { CompanyActionError } from './actions'
import type { CompanyEvidence } from './types'
import { deepestRegions } from './normalize'

/**
 * SERVER-ONLY. "Reach out" for one company: gather the facts (master CV,
 * the best résumé variant for the company's domain, the opted-in region
 * facts, the company's public facts and a contact suggestion), draft with
 * the AI when one is configured, and fact-lock the result (else the
 * template). Contacts come ONLY from the user's own LinkedIn connections
 * (a referral ask) or a role address published on the company's own site;
 * lee never looks up or guesses a person's email.
 */

const DOMAIN_SKILLS: Readonly<Partial<Record<Industry, readonly string[]>>> = {
  payments: SKILL_GROUPS.payments,
  fintech: SKILL_GROUPS.payments,
  banking: SKILL_GROUPS.payments,
  einvoicing: SKILL_GROUPS.einvoicing,
  erp: SKILL_GROUPS.einvoicing,
  data: [...SKILL_GROUPS.dataAnalyst, ...SKILL_GROUPS.analyticsEng],
}

/** CV skills (verbatim) that are ready, the company's domain skills first; at most 5. */
export function relevantSkills(master: MasterCV, readySkills: readonly string[], industries: readonly string[]): string[] {
  const ready = new Set(readySkills.map((s) => normalizeForMatch(s)))
  const domain = new Set(industries.filter(isIndustry).flatMap((i) => DOMAIN_SKILLS[i] ?? []).map((s) => normalizeForMatch(s)))
  const all = [...master.skills.primary, ...(master.skills.secondary ?? [])]
  const isReady = (s: string): boolean => ready.size === 0 || ready.has(normalizeForMatch(s))
  const picked = all.filter(isReady)
  const sorted = [...picked.filter((s) => domain.has(normalizeForMatch(s))), ...picked.filter((s) => !domain.has(normalizeForMatch(s)))]
  return [...new Set(sorted)].slice(0, 5)
}

/** One CV bullet, verbatim: the first that names a domain skill, else the latest role's first bullet. */
export function highlightBullet(master: MasterCV, skills: readonly string[]): string | null {
  const bullets = master.experience.flatMap((e) => e.bullets).filter((b) => b.trim().length > 20 && b.length <= 240)
  const terms = skills.map((s) => normalizeForMatch(s))
  return bullets.find((b) => terms.some((t) => normalizeForMatch(b).includes(t))) ?? bullets[0] ?? null
}

export interface ReachOutPlan {
  facts: SpeculativeFacts
  draft: SpeculativeDraft
  /** The connections at the company (names and positions from the user's own import). */
  people: Array<{ name: string; position: string }>
  emails: string[]
}

export async function draftReachOut(
  userId: string,
  id: string,
  opts: { channel?: SpeculativeChannel; ai?: AIProvider | null } = {},
): Promise<ReachOutPlan> {
  const row = await companiesQ.getCompany(userId, id)
  if (!row) throw new CompanyActionError('Company not found.')
  const master = await getMasterCV(userId)
  if (!master) throw new CompanyActionError('Add your CV in Résumé first: the draft is built only from it.')
  const prefs = searchPrefsFromProfile(await profileQ.get(userId))
  const name = String((row.normalized as { name?: unknown }).name ?? 'the company')
  const ev = (row.evidence ?? {}) as CompanyEvidence
  const deepest = deepestRegions(row.regionIds)
  const place = deepest[0] ? placeName(deepest[0]) : null
  const hint = await referralHint(userId, name)
  const emails = ev.contactEmails ?? []
  const contact: SpeculativeContact = hint?.people[0]
    ? { kind: 'referral', name: hint.people[0].name, position: hint.people[0].position }
    : emails[0]
      ? { kind: 'role_email', email: emails[0] }
      : { kind: 'none' }
  const channel: SpeculativeChannel = opts.channel ?? (contact.kind === 'referral' ? 'linkedin' : 'email')
  const skills = relevantSkills(master, prefs.readySkills, row.industry)
  const country = deepest[0] ? countryOf(deepest[0]) : null
  const region = country === 'in' ? 'india' : country ? 'gcc' : 'remote'
  const families = row.industry.filter(isIndustry).flatMap((i) => INDUSTRY_FAMILIES[i])
  const variant = suggestVariant(await variantSummaries(userId), { regions: [region], families: [...new Set(families)] }).variant
  const latest = master.experience[0]
  const facts: SpeculativeFacts = {
    channel,
    company: { name, industries: row.industry, place, description: ev.description ?? null },
    candidate: {
      name: master.basics.name,
      headline: master.basics.headline,
      skills,
      highlight: highlightBullet(master, skills),
      currentRole: latest ? `${latest.role} at ${latest.company}` : null,
      variantName: variant?.name ?? null,
    },
    contact: channel === 'linkedin' && contact.kind === 'role_email' ? { kind: 'none' } : contact,
    regionFacts: place ? await loadApplicationFacts(userId, { title: 'Software engineer', location: place }) : null,
  }
  let ai: { subject?: string | null; body: string } | null = null
  if (opts.ai?.draftSpeculativeOutreach) {
    try {
      ai = await opts.ai.draftSpeculativeOutreach(facts, { userId })
    } catch (e) {
      logger.warn('speculative_outreach_ai_failed', { userId, err: e instanceof Error ? e.name : 'unknown' })
    }
  }
  const draft = lockedDraft(facts, ai)
  if (draft.rejected) logger.info('speculative_outreach_fact_lock', { userId, rejected: draft.rejected.length })
  return { facts, draft, people: hint?.people ?? [], emails }
}
