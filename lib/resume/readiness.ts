import { findTerms, normalizeForMatch } from '@/lib/discovery/relevance/text'
import { checkDomainWording, checkFactLock } from './fact-lock'
import { effectiveWording } from './wordings'
import type { Depth, Highlight, ResumeProfile, Skill } from './types'

/**
 * Interview readiness. Items the user can't yet explain stay in the master
 * profile but are kept out of what lee generates by default: variants,
 * tailoring and other AI prompts (via the derived MasterCV), role
 * suggestions and the portfolio.
 *
 * How an item may be presented:
 *   full      interviewReady — any fact-locked wording
 *   override  not ready, ai_assisted, and the VARIANT explicitly includes
 *             it — any fact-locked wording, shown with OVERRIDE_WARNING
 *   domain    domainReady only — the user owns the idea/design, not the
 *             code: shown ONLY in a wording that passes both the number
 *             lock and the domain lock (no implementation claims)
 *   excluded  everything else (learning items until marked ready)
 */

export const DEPTH_LABELS: Readonly<Record<Depth, string>> = {
  own: 'Built it, can explain it',
  ai_assisted: 'AI-assisted, studying it',
  learning: 'Learning',
}

export const OVERRIDE_WARNING = 'You may be asked about this in an interview.'
export const NEEDS_DOMAIN_WORDING = 'Domain-ready only: add a wording that describes the design or domain work.'

export interface Readiness {
  depth: Depth
  interviewReady: boolean
  domainReady: boolean
}

export type Presentation = 'full' | 'override' | 'domain' | 'excluded'

export function isReady(item: Readiness): boolean {
  return item.interviewReady
}

/** A not-ready item a variant may still include in full, with a warning. */
export function canOverride(item: Readiness): boolean {
  return !item.interviewReady && item.depth === 'ai_assisted'
}

export function presentation(item: Readiness, overridden = false): Presentation {
  if (item.interviewReady) return 'full'
  if (overridden && canOverride(item)) return 'override'
  if (item.domainReady) return 'domain'
  return 'excluded'
}

export function readyHighlights(highlights: readonly Highlight[]): Highlight[] {
  return highlights.filter(isReady)
}

/** Can `text` stand for a domain-only highlight? Number lock + domain lock. */
export function isDomainWording(text: string, master: string): boolean {
  return checkFactLock(text, master).ok && checkDomainWording(text).ok
}

export interface ResolvedHighlight {
  text: string
  /** The wording used; null = the master text. */
  wordingId: string | null
  mode: Exclude<Presentation, 'excluded'>
  /** The chosen wording was dropped (gone, failed a lock). */
  stale: boolean
}

/**
 * The text shown for a highlight under its readiness, or null when it may
 * not be shown. A domain-only highlight uses the chosen wording if it is a
 * domain wording, else the master text if that is one, else the first
 * alternate that is — and is left out when none qualifies.
 */
export function resolveHighlight(
  h: Highlight,
  wordingId: string | null,
  overridden = false,
): ResolvedHighlight | null {
  const mode = presentation(h, overridden)
  if (mode === 'excluded') return null
  if (mode !== 'domain') return { ...effectiveWording(h, wordingId), mode }
  const chosen = wordingId ? h.alternates.find((a) => a.id === wordingId) : undefined
  if (chosen && isDomainWording(chosen.text, h.text)) return { text: chosen.text, wordingId: chosen.id, mode, stale: false }
  const stale = wordingId !== null
  if (checkDomainWording(h.text).ok) return { text: h.text, wordingId: null, mode, stale }
  const fallback = h.alternates.find((a) => isDomainWording(a.text, h.text))
  return fallback ? { text: fallback.text, wordingId: fallback.id, mode, stale } : null
}

/** Texts of a highlight list that may be shown without any variant choice. */
export function presentableTexts(highlights: readonly Highlight[]): string[] {
  return highlights.flatMap((h) => {
    const r = resolveHighlight(h, null)
    return r ? [r.text] : []
  })
}

// ---------------------------------------------------------------------------
// Evidence: what can back a skill or a role suggestion
// ---------------------------------------------------------------------------

export interface Evidence {
  /** Fully ready items (implementation evidence). */
  full: string
  /** Domain-only items, in domain wording only (backs domain skills). */
  domain: string
}

export function evidenceOf(profile: ResumeProfile): Evidence {
  const full: string[] = []
  const domain: string[] = []
  for (const w of profile.work) {
    const ready = readyHighlights(w.highlights)
    if (ready.length > 0) full.push(w.position, ...w.keywords, ...ready.map((h) => h.text))
    for (const h of w.highlights) {
      const r = resolveHighlight(h, null)
      if (r?.mode === 'domain') domain.push(r.text)
    }
  }
  for (const p of profile.projects) {
    const mode = presentation(p)
    if (mode === 'full') {
      full.push(p.name, p.description, ...p.keywords, ...readyHighlights(p.highlights).map((h) => h.text))
    } else if (mode === 'domain') {
      // Never the stack keywords: they claim the implementation.
      if (checkDomainWording(p.description).ok) domain.push(p.name, p.description)
      domain.push(...presentableTexts(p.highlights))
    }
  }
  return { full: normalizeForMatch(full.filter(Boolean).join(' | ')), domain: normalizeForMatch(domain.filter(Boolean).join(' | ')) }
}

function mentions(text: string, name: string): boolean {
  const term = normalizeForMatch(name)
  return term.length > 0 && findTerms(text, [term]).length > 0
}

/**
 * Is this skill backed: marked ready by the user, or mentioned by a fully
 * ready item — or, for a domain skill, by domain-only evidence too.
 */
export function isSkillBacked(skill: Skill, evidence: Evidence): boolean {
  if (skill.interviewReady) return true
  if (mentions(evidence.full, skill.name)) return true
  return skill.kind === 'domain' && (skill.domainReady || mentions(evidence.domain, skill.name))
}

/** Ids of every backed skill in the profile. */
export function backedSkillIds(profile: ResumeProfile): Set<string> {
  const evidence = evidenceOf(profile)
  const ids = new Set<string>()
  for (const g of profile.skills) for (const s of g.skills) if (isSkillBacked(s, evidence)) ids.add(s.id)
  return ids
}
