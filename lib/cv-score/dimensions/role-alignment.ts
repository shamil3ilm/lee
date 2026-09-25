/**
 * v12.0 — Role / title alignment (Role Match component, deterministic).
 *
 * title score: best of (current title, previous title, headline) —
 *   same role family → max(70, token overlap); otherwise 80% of overlap.
 * responsibilities score: share of JD responsibilities with ≥2 content-word
 *   stems (or all, when shorter) present in the CV.
 * score = mean of the available components.
 */
import { makeFinding } from '../findings'
import { contentStems, excerpt } from '../text'
import type { CvFinding, DimensionResult, JobTarget, ScorableCv } from '../types'

export interface RoleAlignmentDetails {
  jdTitle: string
  jdFamily: string | null
  bestCvTitle: string | null
  titleScore: number
  responsibilitiesCovered: number
  responsibilitiesTotal: number
  responsibilitiesScore: number | null
}

const FAMILIES: [string, RegExp][] = [
  ['fullstack', /\b(full[- ]?stack)\b/i],
  ['mobile', /\b(ios|android|mobile|react native|flutter)\b/i],
  ['ml', /\b(machine learning|ml|ai|data scientist|research scientist|nlp)\b/i],
  ['data', /\b(data engineer|analytics|data platform|etl|bi|data analyst)\b/i],
  ['devops', /\b(devops|sre|site reliability|infrastructure|platform|cloud)\b/i],
  ['security', /\b(security|appsec|infosec)\b/i],
  ['qa', /\b(qa|quality|test|sdet)\b/i],
  ['frontend', /\b(front[- ]?end|ui engineer|web developer)\b/i],
  ['backend', /\b(back[- ]?end|server|api|software engineer|software developer|developer|programmer)\b/i],
  ['management', /\b(manager|head of|director|vp|cto)\b/i],
  ['product', /\b(product manager|product owner)\b/i],
  ['design', /\b(designer|ux|ui\/ux)\b/i],
]

const LEVEL_WORDS = /\b(senior|sr|junior|jr|lead|staff|principal|mid|intern|i{1,3}|iv|level \d)\b\.?/gi

export function roleFamily(title: string | null | undefined): string | null {
  if (!title) return null
  for (const [fam, re] of FAMILIES) if (re.test(title)) return fam
  return null
}

function titleSimilarity(jdTitle: string, cvTitle: string): number {
  const jd = contentStems(jdTitle.replace(LEVEL_WORDS, ' '))
  const cv = contentStems(cvTitle.replace(LEVEL_WORDS, ' '))
  const overlap = jd.size === 0 ? 0 : [...jd].filter((s) => cv.has(s)).length / jd.size
  const fam = roleFamily(jdTitle)
  const sameFamily = fam !== null && roleFamily(cvTitle) === fam
  return Math.round(100 * (sameFamily ? Math.max(0.7, overlap) : overlap * 0.8))
}

export function scoreRoleAlignment(cv: ScorableCv, target: JobTarget): DimensionResult<RoleAlignmentDetails> {
  const findings: CvFinding[] = []
  const candidates = [cv.roles[0]?.title, cv.roles[1]?.title, cv.headline].filter(
    (t): t is string => !!t && t.trim().length > 0,
  )
  let titleScore = 0
  let bestCvTitle: string | null = null
  for (const t of candidates) {
    const s = titleSimilarity(target.title, t)
    if (s > titleScore) {
      titleScore = s
      bestCvTitle = t
    }
  }
  if (titleScore < 50) {
    findings.push(makeFinding('roleAlignment', {
      severity: titleScore < 25 ? 'major' : 'minor',
      message: candidates.length
        ? `Your recent titles (${candidates.slice(0, 2).join(', ')}) don't clearly align with "${target.title}"`
        : `No job titles found to compare with "${target.title}"`,
      suggestion: 'If accurate, echo the target role in your headline/summary and emphasise the matching parts of your recent roles.',
    }))
  }

  const cvStems = contentStems(
    [...cv.bullets.map((b) => b.text), ...cv.roles.map((r) => r.title), cv.headline ?? '', ...cv.sections.filter((s) => /summary|profile/i.test(s.heading)).flatMap((s) => s.lines)].join('\n'),
  )
  const resp = target.responsibilities
  const uncovered: string[] = []
  let covered = 0
  for (const r of resp) {
    const stems = [...contentStems(r)]
    const need = Math.min(2, stems.length)
    const hits = stems.filter((s) => cvStems.has(s)).length
    if (need > 0 && hits >= need) covered++
    else uncovered.push(r)
  }
  const responsibilitiesScore = resp.length ? Math.round((covered / resp.length) * 100) : null
  if (uncovered.length && responsibilitiesScore !== null && responsibilitiesScore < 70) {
    findings.push(makeFinding('roleAlignment', {
      severity: responsibilitiesScore < 40 ? 'major' : 'minor',
      message: `${uncovered.length} of ${resp.length} key responsibilities aren't reflected in your CV`,
      location: { section: 'Job description', excerpt: excerpt(uncovered.slice(0, 3).join(' · ')) },
      suggestion: 'Where you have done similar work, describe it with the same vocabulary the job uses.',
    }))
  }

  const parts = [titleScore, responsibilitiesScore].filter((x): x is number => x !== null)
  const score = Math.round(parts.reduce((s, x) => s + x, 0) / parts.length)
  return {
    score,
    details: {
      jdTitle: target.title,
      jdFamily: roleFamily(target.title),
      bestCvTitle,
      titleScore,
      responsibilitiesCovered: covered,
      responsibilitiesTotal: resp.length,
      responsibilitiesScore,
    },
    findings,
  }
}
