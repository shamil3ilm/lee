import { getAIProviderForUser } from '@/lib/ai'
import * as linkedinQ from '@/lib/db/queries/linkedin'
import * as profileQ from '@/lib/db/queries/profile'
import { searchPrefsFromProfile } from '@/lib/discovery/relevance/prefs'
import { logger } from '@/lib/logger'
import { readyCvSkills } from '@/lib/radar/suggest'
import { getResumeProfile } from '@/lib/resume/service'
import { toPlainText } from '@/lib/variants/export'
import { acceptedFamilies, renderStored, variantSummaries } from '@/lib/variants/service'
import { consumeRateLimit, RATE_RULES } from '../rate-limit'
import { checkPostFacts, profileFactText } from './facts'
import { buildChecklist, type CheckItem } from './optimizer'

/**
 * SERVER-ONLY. Profile optimizer: the checklist plus AI rewrites of the
 * headline and About, written from the user's best CV variant (the first
 * variant, else the master profile) and fact-locked against the master
 * profile — a suggestion with a number or link the profile lacks is
 * dropped. The user copies what they like into LinkedIn by hand.
 */

const GCC = new Set(['AE', 'SA', 'QA', 'KW', 'BH', 'OM'])

export interface OptimizerView {
  imported: boolean
  importedAt: string | null
  headline: string
  about: string
  checklist: CheckItem[]
}

export async function loadOptimizer(userId: string): Promise<OptimizerView> {
  const [imp, { profile }, families, row] = await Promise.all([linkedinQ.getImport(userId), getResumeProfile(userId), acceptedFamilies(userId), profileQ.get(userId)])
  const prefs = row ? searchPrefsFromProfile(row) : null
  const regions: string[] = prefs ? [...prefs.regions, ...prefs.otherCountries] : []
  const checklist = buildChecklist({
    headline: imp?.headline ?? '',
    about: imp?.summary ?? '',
    positions: (imp?.positions ?? []).map((p) => ({ company: p.company ?? '', title: p.title ?? '' })),
    targetRoles: families.map((f) => f.label),
    keywords: readyCvSkills(profile),
    cvWork: profile.work.map((w) => ({ company: w.name, position: w.position })),
    portfolioUrl: profile.basics.url,
    caseStudyUrls: profile.portfolio.caseStudies.map((c) => c.url),
    gcc: regions.some((c) => GCC.has(c)) || GCC.has(profile.basics.location.countryCode),
  })
  return { imported: imp !== null, importedAt: imp?.importedAt.toISOString() ?? null, headline: imp?.headline ?? '', about: imp?.summary ?? '', checklist }
}

export type SuggestResult = { ok: true; headlines: string[]; about: string | null; dropped: number } | { ok: false; error: string }

export async function suggestProfileRewrites(userId: string, now: Date = new Date()): Promise<SuggestResult> {
  if (!(await consumeRateLimit(userId, 'linkedin_draft', RATE_RULES.linkedin_draft, now))) return { ok: false, error: 'Too many suggestions this hour.' }
  const [imp, { profile }, families, variants] = await Promise.all([linkedinQ.getImport(userId), getResumeProfile(userId), acceptedFamilies(userId), variantSummaries(userId)])
  let cvText = profileFactText(profile)
  if (variants[0]) {
    try {
      cvText = toPlainText((await renderStored(userId, variants[0].id, undefined, profile)).rendered)
    } catch {
      // Keep the master profile text.
    }
  }
  const facts = profileFactText(profile)
  try {
    const ai = await getAIProviderForUser(userId)
    const out = await ai.suggestLinkedInProfile(
      { headline: imp?.headline ?? '', about: imp?.summary ?? '', targetRoles: families.map((f) => f.label), keywords: readyCvSkills(profile).slice(0, 12), cvText },
      { userId },
    )
    const headlines = out.headlines.map((h) => h.trim()).filter((h) => h && checkPostFacts(h, facts).ok)
    const about = out.about.trim() && checkPostFacts(out.about, facts).ok ? out.about.trim() : null
    const dropped = out.headlines.length - headlines.length + (out.about.trim() && !about ? 1 : 0)
    return { ok: true, headlines, about, dropped }
  } catch (e) {
    logger.warn('linkedin_profile_suggest_failed', { userId, err: e instanceof Error ? e.name : 'unknown' })
    return { ok: false, error: 'Could not draft suggestions right now. Try again later.' }
  }
}
