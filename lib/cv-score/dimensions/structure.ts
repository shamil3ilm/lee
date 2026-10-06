/**
 * v12.0 — Structure & length (feeds the Structure headline score).
 *
 * Starts at 100 and subtracts capped penalties:
 *   length vs seniority (−8/−15) · reverse chronology (−15) · date problems
 *   (−5 each, cap −15) · gaps > 6 months (−5 each, cap −15) · bullets per
 *   role outside 3–6 (−4, or −8 for none; cap −20; 3 most recent roles) ·
 *   Education before Experience for experienced candidates (−5).
 *
 * v1.1 — years are weighted ENGINEERING years (career.ts: full-time counts,
 * internships at half, non-engineering roles excluded, overlaps merged) and
 * the finding shows the breakdown; the page norm follows the target market
 * (region.ts); chronology only flags a real inversion; findings cite lines.
 */
import {
  breakdownSummary,
  chronologyInversions,
  employmentGaps,
  experienceBreakdown,
  type ExperienceBreakdown,
  type RoleKind,
} from '../career'
import { headerEvidence, roleEvidence } from '../evidence'
import { makeFinding } from '../findings'
import { pageNorm } from '../region'
import { clamp } from '../text'
import type { CvFinding, CvLineRef, DimensionResult, ScorableCv, ScoreContext } from '../types'

export interface ParsedRoleSummary {
  title: string
  company: string
  start?: string
  end?: string
  kind: RoleKind
  bullets: number
}

export interface StructureDetails {
  years: number
  pages: number
  pageLimit: number
  reverseChronological: boolean
  gaps: { between: string; months: number }[]
  bulletsPerRole: number[]
  sectionOrder: string[]
  /** v1.1 — how `years` was computed. */
  experience?: ExperienceBreakdown
  /** v1.1 — the roles as parsed (lets the UI show what the scorer read). */
  roles?: ParsedRoleSummary[]
  /** v1.1 — why the page limit is what it is. */
  pageNormReason?: string
}

const RECENT_ROLES = 3

function roleLabel(cv: ScorableCv, i: number): string {
  const r = cv.roles[i]
  return (r && [r.title, r.company].filter(Boolean).join(' at ')) || `Role ${i + 1}`
}

function rolesEvidence(cv: ScorableCv, indexes: number[]): CvLineRef[] {
  return indexes.flatMap((i) => roleEvidence(cv, i))
}

export function scoreStructure(
  cv: ScorableCv,
  ctx: Pick<ScoreContext, 'now'> & Partial<Pick<ScoreContext, 'region'>>,
): DimensionResult<StructureDetails> {
  const findings: CvFinding[] = []
  const experience = experienceBreakdown(cv.roles, ctx.now)
  const years = experience.years
  const pages = cv.meta.pageCountEstimate ?? 1
  const norm = pageNorm(years, ctx.region)
  const pageLimit = norm.limit
  const order = cv.meta.sectionOrder ?? []
  const roles: ParsedRoleSummary[] = cv.roles.map((r, i) => ({
    title: r.title,
    company: r.company,
    ...(r.start ? { start: r.start } : {}),
    ...(r.end ? { end: r.end } : {}),
    kind: experience.kinds[i]!,
    bullets: r.bullets.length,
  }))

  if (cv.roles.length === 0) {
    return {
      score: 30,
      details: { years: 0, pages, pageLimit, reverseChronological: true, gaps: [], bulletsPerRole: [], sectionOrder: order, experience, roles, pageNormReason: norm.why },
      findings: [
        makeFinding('structure', {
          severity: 'critical',
          message: 'No work experience entries could be identified',
          evidence: headerEvidence(cv),
          suggestion: 'Parsers find roles by a "Title — Company | Start – End" line followed by bullets; that layout lets them read yours.',
        }),
      ],
    }
  }

  let penalty = 0

  if (pages > pageLimit) {
    const big = pages > pageLimit + 1
    penalty += big ? 15 : 8
    const oldest = cv.roles.length - 1
    findings.push(makeFinding('structure', {
      severity: big ? 'major' : 'minor',
      message: `CV is about ${pages} pages — ${pageLimit} page${pageLimit > 1 ? 's' : ''} is typical at ${years} years of engineering experience`,
      evidence: rolesEvidence(cv, [oldest]),
      suggestion: `Why: ${norm.why}. Counted as ${breakdownSummary(experience)}. Trimming older or unrelated roles to 1–2 bullets usually gets there.`,
    }))
  }

  const inversions = chronologyInversions(cv.roles, ctx.now)
  const reverseChronological = inversions.length === 0
  if (!reverseChronological) {
    penalty += 15
    const i = inversions[0]!
    findings.push(makeFinding('structure', {
      severity: 'major',
      message: `Roles aren't in reverse-chronological order ("${roleLabel(cv, i + 1)}" is more recent than "${roleLabel(cv, i)}" above it)`,
      evidence: rolesEvidence(cv, [i, i + 1]),
      suggestion: 'Recruiters and ATS read the first role as your current one — listing the most recent role first matches that.',
    }))
  }

  let datePenalty = 0
  cv.roles.forEach((r, i) => {
    const label = roleLabel(cv, i)
    if (!r.start) {
      datePenalty += 5
      findings.push(makeFinding('structure', {
        severity: 'minor',
        message: `Missing or unreadable start date for "${label}"`,
        location: { section: 'Experience', index: i, excerpt: label },
        evidence: roleEvidence(cv, i),
        suggestion: 'A consistent format such as "Jan 2021 – Present" lets parsers compute your experience.',
      }))
    } else if (r.end && r.end !== 'present' && r.end < r.start) {
      datePenalty += 5
      findings.push(makeFinding('structure', {
        severity: 'major',
        message: `End date is before start date for "${label}"`,
        location: { section: 'Experience', index: i, excerpt: label },
        evidence: roleEvidence(cv, i),
      }))
    }
  })
  penalty += Math.min(15, datePenalty)

  const gaps = employmentGaps(cv.roles, ctx.now)
  penalty += Math.min(15, gaps.length * 5)
  const gapDetails = gaps.map((g) => {
    const after = cv.roles[g.afterRoleIndex]
    const before = cv.roles[g.beforeRoleIndex]
    const between = `${after?.company || after?.title || '?'} → ${before?.company || before?.title || '?'}`
    findings.push(makeFinding('structure', {
      severity: 'minor',
      message: `Employment gap of ${g.months} months (${between})`,
      evidence: rolesEvidence(cv, [g.beforeRoleIndex, g.afterRoleIndex]),
      suggestion: 'A one-line reason for a longer gap (study, relocation, caregiving, freelance) answers the question before it is asked.',
    }))
    return { between, months: g.months }
  })

  const bulletsPerRole = cv.roles.map((r) => r.bullets.length)
  let bulletPenalty = 0
  const offRange: string[] = []
  const offRangeIdx: number[] = []
  cv.roles.slice(0, RECENT_ROLES).forEach((r, i) => {
    const n = r.bullets.length
    const label = roleLabel(cv, i)
    if (n === 0) {
      bulletPenalty += 8
      findings.push(makeFinding('structure', {
        severity: 'major',
        message: `"${label}" has no bullets`,
        location: { section: 'Experience', index: i, excerpt: label },
        evidence: roleEvidence(cv, i),
        suggestion: 'A recent role with no bullets reads as empty — 3–6 achievement bullets show what you did there.',
      }))
    } else if (n < 3 || n > 6) {
      bulletPenalty += 4
      offRange.push(`${label} (${n})`)
      offRangeIdx.push(i)
    }
  })
  if (offRange.length) {
    findings.push(makeFinding('structure', {
      severity: 'minor',
      message: `Recent roles outside the ideal 3–6 bullets: ${offRange.join(', ')}`,
      evidence: rolesEvidence(cv, offRangeIdx),
      suggestion: '3–6 focused bullets per recent role is what recruiters can take in on a skim.',
    }))
  }
  penalty += Math.min(20, bulletPenalty)

  const eduIdx = order.indexOf('education')
  const expIdx = order.indexOf('experience')
  if (years >= 2 && eduIdx !== -1 && expIdx !== -1 && eduIdx < expIdx) {
    penalty += 5
    const lines = cv.lines ?? cv.plainText.split('\n')
    const edu = cv.sections.find((s) => s.headingIndex !== undefined && /educat|academ|qualif/i.test(s.heading))
    findings.push(makeFinding('structure', {
      severity: 'minor',
      message: 'Education appears before Experience',
      evidence: edu?.headingIndex !== undefined ? [{ index: edu.headingIndex, text: lines[edu.headingIndex]!.trim() }] : headerEvidence(cv),
      suggestion: 'With 2+ years of experience, recruiters look for Experience first — leading with it puts your strongest section on top.',
    }))
  }

  return {
    score: clamp(100 - penalty),
    details: {
      years,
      pages,
      pageLimit,
      reverseChronological,
      gaps: gapDetails,
      bulletsPerRole,
      sectionOrder: order,
      experience,
      roles,
      pageNormReason: norm.why,
    },
    findings,
  }
}
