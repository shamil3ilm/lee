/**
 * v12.0 — Keyword & skill coverage (feeds Skills Match).
 *
 * JD skills = parsedMeta.tech_stack ∪ vocabulary terms found in the
 * requirements and description (dictionary-based phrase extraction — see
 * synonyms.ts). Terms only mentioned under "nice to have" / "bonus" are
 * weighted at half.
 *
 * Per term:
 *   matched — used in experience / projects / summary (evidence of use)
 *   partial — only listed in Skills, or a same-family sibling is present
 *   missing — no trace in the CV
 */
import { canonicalize, familyOf, findSkillsInText } from '../synonyms'
import { makeFinding } from '../findings'
import { niceToHaveFromDescription } from '../jd'
import { looseNormalize } from '../text'
import type { CvFinding, DimensionResult, JobTarget, ScorableCv, ScoreContext, SkippedDimension } from '../types'

export type KeywordStatus = 'matched' | 'partial' | 'missing'

export interface KeywordHit {
  term: string
  status: KeywordStatus
  where: string[]
  /** Sibling skill that earned a partial match. */
  via?: string
}

export interface KeywordDetails {
  required: KeywordHit[]
  niceToHave: KeywordHit[]
  matched: string[]
  partial: string[]
  missing: string[]
  /** Fraction of required terms present ANYWHERE in the CV text (ATS presence). */
  presence: number
  coverage: { required: number; niceToHave: number }
}

export interface JdTerms {
  required: string[]
  niceToHave: string[]
}

/** Extract canonical JD skill terms, split required vs nice-to-have. */
export function jdTerms(target: JobTarget): JdTerms {
  const required = new Set<string>()
  for (const t of target.techStack) {
    const c = canonicalize(t)
    if (c) required.add(c)
  }
  const niceAll = [...target.niceToHave, ...niceToHaveFromDescription(target.descriptionMd)]
  const niceText = niceAll.join('\n')
  const niceLines = new Set(niceAll.map((l) => looseNormalize(l)))
  const descNoNice = target.descriptionMd
    .split('\n')
    .filter((l) => !niceLines.has(looseNormalize(l.replace(/^\s*[-*•]\s*/, ''))))
    .join('\n')
  for (const c of findSkillsInText(`${target.requirements.join('\n')}\n${descNoNice}`).keys()) {
    required.add(c)
  }
  const nice = new Set<string>()
  for (const c of findSkillsInText(niceText).keys()) {
    if (!required.has(c)) nice.add(c)
  }
  return { required: [...required].sort(), niceToHave: [...nice].sort() }
}

interface CvAreas {
  skills: Set<string>
  skillsText: string
  areas: { name: string; text: string; skills: Set<string> }[]
  allSkills: Set<string>
  allText: string
}

function cvAreas(cv: ScorableCv): CvAreas {
  const skills = new Set<string>()
  for (const s of cv.skillsListed) {
    const c = canonicalize(s)
    if (c) skills.add(c)
  }
  const skillsText = cv.skillsListed.join(', ')
  for (const c of findSkillsInText(skillsText).keys()) skills.add(c)

  const experienceText = cv.roles
    .map((r) => [r.title, ...r.bullets, ...(r.tech ?? [])].join('\n'))
    .join('\n')
  const bulletsBySection = (name: string): string =>
    cv.bullets.filter((b) => b.section.toLowerCase().startsWith(name)).map((b) => b.text).join('\n')
  const sectionText = (key: string): string =>
    cv.sections
      .filter((s) => s.heading.toLowerCase().includes(key))
      .flatMap((s) => s.lines)
      .join('\n')
  const expText = experienceText || bulletsBySection('experience') || sectionText('experience')
  const areas = [
    { name: 'experience', text: expText },
    { name: 'projects', text: sectionText('project') || bulletsBySection('project') },
    { name: 'summary', text: [cv.headline ?? '', sectionText('summary'), sectionText('profile')].join('\n') },
  ].map((a) => {
    const set = new Set(findSkillsInText(a.text).keys())
    // Role tech arrays are exact skill names — canonicalise directly.
    if (a.name === 'experience') for (const r of cv.roles) for (const t of r.tech ?? []) set.add(canonicalize(t))
    return { ...a, skills: set }
  })
  const allSkills = new Set<string>([...skills, ...findSkillsInText(cv.plainText).keys()])
  for (const a of areas) for (const s of a.skills) allSkills.add(s)
  return { skills, skillsText, areas, allSkills, allText: looseNormalize(cv.plainText) }
}

function hasTerm(set: Set<string>, text: string, term: string): boolean {
  if (set.has(term)) return true
  // Terms outside the vocabulary: loose substring on word boundaries.
  const t = looseNormalize(term)
  if (t.length < 2) return false
  const re = new RegExp(`(?<![a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`)
  return re.test(looseNormalize(text))
}

function classify(term: string, a: CvAreas): KeywordHit {
  const where: string[] = []
  for (const area of a.areas) if (hasTerm(area.skills, area.text, term)) where.push(area.name)
  const inSkills = hasTerm(a.skills, a.skillsText, term)
  if (inSkills) where.push('skills')
  if (where.some((w) => w !== 'skills')) return { term, status: 'matched', where }
  if (inSkills) return { term, status: 'partial', where }
  const fam = familyOf(term)
  if (fam) {
    const sibling = [...a.allSkills].sort().find((s) => s !== term && familyOf(s) === fam)
    if (sibling) return { term, status: 'partial', where: [], via: sibling }
  }
  return { term, status: 'missing', where: [] }
}

const VALUE: Record<KeywordStatus, number> = { matched: 1, partial: 0.5, missing: 0 }

function ratio(hits: KeywordHit[]): number {
  if (hits.length === 0) return 1
  return hits.reduce((s, h) => s + VALUE[h.status], 0) / hits.length
}

export function scoreKeywords(
  cv: ScorableCv,
  target: JobTarget,
  ctx: Pick<ScoreContext, 'canAutofix'>,
): DimensionResult<KeywordDetails> | SkippedDimension {
  const terms = jdTerms(target)
  if (terms.required.length + terms.niceToHave.length === 0) {
    return {
      skipped: true,
      code: 'no_jd_skills',
      reason: 'The job has no recognisable skills or tech stack to match against.',
    }
  }
  const a = cvAreas(cv)
  const required = terms.required.map((t) => classify(t, a))
  const niceToHave = terms.niceToHave.map((t) => classify(t, a))

  const wReq = required.length
  const wNice = niceToHave.length * 0.5
  const score = Math.round(
    ((ratio(required) * wReq + ratio(niceToHave) * wNice) / (wReq + wNice)) * 100,
  )
  const all = [...required, ...niceToHave]
  const presence = required.length === 0
    ? 1
    : required.filter((h) => a.allSkills.has(h.term) || hasTerm(new Set(), cv.plainText, h.term)).length /
      required.length

  const findings: CvFinding[] = []
  const missingReq = required.filter((h) => h.status === 'missing').map((h) => h.term)
  if (missingReq.length) {
    const frac = missingReq.length / required.length
    findings.push(
      makeFinding('keywords', {
        severity: frac > 0.5 ? 'critical' : frac >= 0.25 ? 'major' : 'minor',
        message: `${missingReq.length} of ${required.length} required skills are missing: ${missingReq.join(', ')}`,
        suggestion:
          'Only add a skill if you genuinely have it — then show it in a bullet where you used it. Otherwise treat it as a gap to address in your cover letter or learning plan.',
      }),
    )
  }
  const missingNice = niceToHave.filter((h) => h.status === 'missing').map((h) => h.term)
  if (missingNice.length) {
    findings.push(
      makeFinding('keywords', {
        severity: 'minor',
        message: `Nice-to-have skills not found: ${missingNice.join(', ')}`,
      }),
    )
  }
  const listedOnly = all.filter((h) => h.status === 'partial' && !h.via).map((h) => h.term)
  if (listedOnly.length) {
    findings.push(
      makeFinding('keywords', {
        severity: 'minor',
        message: `Listed in Skills but never shown in your experience: ${listedOnly.join(', ')}`,
        suggestion: 'Mention where you used these in a role bullet so recruiters see real usage.',
      }),
    )
  }
  // Evidence exists in the CV but the Skills section doesn't list the term —
  // the one keyword fix we can apply automatically.
  for (const h of all) {
    if (h.status === 'matched' && !h.where.includes('skills')) {
      findings.push(
        makeFinding(
          'keywords',
          {
            severity: 'minor',
            message: `"${h.term}" appears in your ${h.where.join(' / ')} but not in your Skills list`,
            suggestion: `Add "${h.term}" to your Skills section so ATS keyword filters pick it up.`,
            fix: { kind: 'add_skill', term: h.term },
            headlines: ['skillsMatch', 'ats'],
          },
          ctx.canAutofix,
        ),
      )
    }
  }

  const bucket = (s: KeywordStatus): string[] => all.filter((h) => h.status === s).map((h) => h.term)
  return {
    score,
    details: {
      required,
      niceToHave,
      matched: bucket('matched'),
      partial: bucket('partial'),
      missing: bucket('missing'),
      presence: Math.round(presence * 100) / 100,
      coverage: {
        required: Math.round(ratio(required) * 100) / 100,
        niceToHave: Math.round(ratio(niceToHave) * 100) / 100,
      },
    },
    findings,
  }
}
