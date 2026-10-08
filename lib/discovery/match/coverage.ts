import { contentStems, excerpt } from '@/lib/cv-score/text'
import type { JdLine, ParsedJd } from './jd'
import { skillsInText } from './lexicon'
import { creditFor } from './skills'
import type { MatchComponent, MatchProfile, RequirementCheck } from './types'

/**
 * Requirement-level coverage: every must-have and nice-to-have line of the
 * JD, met / partial / missing against READY profile evidence, with the
 * profile line that backs it. Lines naming no known skill are checked by
 * content-word overlap with the profile's ready lines ("not checked" when
 * nothing overlaps: lee does not guess about soft asks).
 *
 * Responsibilities overlap (0–10): the share of responsibility lines that
 * name a skill you have or share at least two content words with one of
 * your ready highlights.
 */

export const RESPONSIBILITIES_MAX = 10
const MAX_CHECKS = 14
const MIN_SHARED_STEMS = 2

function evidenceFor(skills: readonly string[], profile: Pick<MatchProfile, 'evidence'>): string | undefined {
  for (const line of profile.evidence) {
    const named = skillsInText(line)
    if (skills.some((s) => named.has(s))) return excerpt(line, 110)
  }
  return undefined
}

function overlapLine(text: string, profile: Pick<MatchProfile, 'evidence'>): string | undefined {
  const want = contentStems(text)
  if (want.size === 0) return undefined
  for (const line of profile.evidence) {
    let shared = 0
    for (const s of contentStems(line)) if (want.has(s) && ++shared >= MIN_SHARED_STEMS) return excerpt(line, 110)
  }
  return undefined
}

/** "Go or Java" needs one of them; "PHP, Laravel and MySQL" needs all. */
function lineCredit(l: JdLine, profile: Pick<MatchProfile, 'skills'>): { credit: number; hit: string[] } {
  const credits = l.skills.map((s) => ({ s, ...creditFor(s, profile.skills) }))
  const anyOf = /\bor\b|\//i.test(l.text)
  const value = anyOf
    ? Math.max(...credits.map((c) => c.credit))
    : credits.reduce((sum, c) => sum + c.credit, 0) / credits.length
  return { credit: value, hit: credits.filter((c) => c.credit > 0).map((c) => c.s) }
}

export function checkLine(l: JdLine, profile: Pick<MatchProfile, 'skills' | 'evidence'>): RequirementCheck {
  const base = { text: excerpt(l.text, 120), weight: l.section === 'nice' ? ('nice' as const) : ('must' as const) }
  if (l.skills.length === 0) {
    const ev = overlapLine(l.text, profile)
    return ev ? { ...base, status: 'partial', evidence: ev } : { ...base, status: 'unchecked' }
  }
  const { credit, hit } = lineCredit(l, profile)
  const status = credit >= 0.99 ? 'met' : credit > 0 ? 'partial' : 'missing'
  const ev = hit.length > 0 ? evidenceFor(hit, profile) : undefined
  return ev ? { ...base, status, evidence: ev } : { ...base, status }
}

/** Must-haves first (missing first among them), then nice-to-haves; capped. */
export function requirementChecks(jd: ParsedJd, profile: Pick<MatchProfile, 'skills' | 'evidence'>): RequirementCheck[] {
  const order: Record<RequirementCheck['status'], number> = { missing: 0, partial: 1, met: 2, unchecked: 3 }
  const must = jd.must.map((l) => checkLine(l, profile)).sort((a, b) => order[a.status] - order[b.status])
  // A nice-to-have line with no skill and no overlap ("Rotational shifts.") is not a requirement.
  const nice = jd.nice.map((l) => checkLine(l, profile)).filter((c) => c.status !== 'unchecked')
  return [...must.slice(0, MAX_CHECKS - Math.min(4, nice.length)), ...nice].slice(0, MAX_CHECKS)
}

export function responsibilitiesComponent(
  jd: ParsedJd,
  profile: Pick<MatchProfile, 'skills' | 'evidence'>,
): MatchComponent {
  const max = RESPONSIBILITIES_MAX
  const lines = (jd.responsibilities.length > 0 ? jd.responsibilities : jd.lines.filter((l) => l.section === 'other')).slice(0, 20)
  if (lines.length === 0) return { key: 'responsibilities', label: 'Responsibilities: not stated', points: jd.confidence === 'full' ? 5 : 0, max }
  const overlapping = lines.filter(
    (l) => l.skills.some((s) => creditFor(s, profile.skills).credit > 0) || overlapLine(l.text, profile) !== undefined,
  ).length
  const points = Math.round((max * overlapping) / lines.length)
  return { key: 'responsibilities', label: `Responsibilities: ${overlapping} of ${lines.length} match your work`, points, max }
}
