import { skillsInText } from '../match/lexicon'
import type { RuleMode } from './discovery-prefs'
import { domainEvidence } from './domains'
import { learnedFor, type LearnedTitles } from './learned'
import { familiesFromEvidence, roleFamilyLabel } from './roles'
import { normalizeForMatch } from './text'

/**
 * The domain rule: JD first, the title only a hint, never a filter on an
 * unknown title.
 *   - a learned title wins ("related" passes with its family; "not my
 *     field" is filtered with that reason);
 *   - a tech role (by title or JD) passes; an odd title whose JD reads as a
 *     target family is labelled "<family> · new title";
 *   - filtered ("domain: Marketing") only on POSITIVE evidence of an
 *     unrelated field (its title, or two of its duties in the JD) AND at
 *     most one of the user's ready skills in the posting;
 *   - weak or mixed evidence keeps the posting with an "Uncertain fit —
 *     review" chip (ranked lower), never filtered.
 */

export const UNCERTAIN_FIT = 'Uncertain fit — review'

export interface DomainInput {
  title: string
  description: string | null | undefined
  techStack: readonly string[] | null | undefined
  /** classifyRole(title + JD).engineering */
  engineering: boolean
  /** Families the title alone names. */
  titleFamilies: readonly string[]
  mode: RuleMode
  targets: readonly string[]
  readySkills: readonly string[]
  learned: LearnedTitles
}

export interface DomainOutcome {
  hard: string | null
  penalty: string | null
  /** Neutral label chip: "Backend · new title", "Backend · learned". */
  info: string | null
  /** Family lee inferred (for learning on "Show anyway"). */
  family: string | null
}

const PASS: DomainOutcome = { hard: null, penalty: null, info: null, family: null }

/** The user's ready skills the posting names. */
export function skillOverlap(i: Pick<DomainInput, 'title' | 'description' | 'techStack' | 'readySkills'>): number {
  const mine = new Set(i.readySkills)
  const posting = skillsInText([i.title, (i.techStack ?? []).join(', '), (i.description ?? '').slice(0, 8_000)].join('\n'))
  let n = 0
  for (const s of posting) if (mine.has(s)) n += 1
  return n
}

export function domainOutcome(i: DomainInput): DomainOutcome {
  if (i.mode === 'off') return PASS
  const learned = learnedFor(i.learned, i.title)
  if (learned?.related) {
    return { ...PASS, info: `${learned.family ? roleFamilyLabel(learned.family) : 'Related'} · learned`, family: learned.family }
  }
  if (learned && !learned.related) {
    return i.mode === 'hard' ? { ...PASS, hard: 'domain: not your field (you said so)' } : { ...PASS, penalty: 'not your field (you said so)' }
  }
  const jdFams = familiesFromEvidence(normalizeForMatch([(i.techStack ?? []).join(' '), (i.description ?? '').slice(0, 4_000)].join(' \n ')))
  const inferred = jdFams.find((f) => i.targets.includes(f)) ?? jdFams[0] ?? null
  const overlap = skillOverlap(i)
  const ev = domainEvidence(i.title, i.description)
  const strong = ev.domain !== null && (ev.fromTitle || ev.duties.length >= 2)
  const titleTech = i.titleFamilies.length > 0 || ev.techTitle
  const jdTech = i.engineering || (jdFams.length > 0 && overlap >= 2)
  if (titleTech || (jdTech && !strong)) {
    const odd = i.titleFamilies.length === 0 && inferred !== null && i.targets.includes(inferred)
    return { ...PASS, info: odd ? `${roleFamilyLabel(inferred)} · new title` : null, family: inferred ?? i.titleFamilies[0] ?? null }
  }
  if (strong && overlap <= 1) {
    const reason = `domain: ${ev.domain!.label}`
    return i.mode === 'hard' ? { ...PASS, hard: reason, family: inferred } : { ...PASS, penalty: reason, family: inferred }
  }
  // Positive evidence of another field AND of the user's skills: mixed.
  if (strong) return { ...PASS, penalty: UNCERTAIN_FIT, family: inferred }
  if (overlap >= 2 && !ev.domain) return { ...PASS, info: inferred ? `${roleFamilyLabel(inferred)} · new title` : null, family: inferred }
  return { ...PASS, penalty: UNCERTAIN_FIT, family: inferred }
}
