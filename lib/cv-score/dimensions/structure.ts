/**
 * v12.0 — Structure & length (feeds the Structure headline score).
 *
 * Starts at 100 and subtracts capped penalties:
 *   length vs seniority (−8/−15) · reverse chronology (−15) · date problems
 *   (−5 each, cap −15) · gaps > 6 months (−5 each, cap −15) · bullets per
 *   role outside 3–6 (−4, or −8 for none; cap −20; 3 most recent roles) ·
 *   Education before Experience for experienced candidates (−5).
 */
import { employmentGaps, experienceYears } from '../career'
import { makeFinding } from '../findings'
import { clamp } from '../text'
import type { CvFinding, DimensionResult, ScorableCv, ScoreContext } from '../types'

export interface StructureDetails {
  years: number
  pages: number
  pageLimit: number
  reverseChronological: boolean
  gaps: { between: string; months: number }[]
  bulletsPerRole: number[]
  sectionOrder: string[]
}

const RECENT_ROLES = 3

export function scoreStructure(
  cv: ScorableCv,
  ctx: Pick<ScoreContext, 'now'>,
): DimensionResult<StructureDetails> {
  const findings: CvFinding[] = []
  const years = experienceYears(cv.roles, ctx.now)
  const pages = cv.meta.pageCountEstimate ?? 1
  const pageLimit = years < 3 ? 1 : 2
  const order = cv.meta.sectionOrder ?? []

  if (cv.roles.length === 0) {
    return {
      score: 30,
      details: { years: 0, pages, pageLimit, reverseChronological: true, gaps: [], bulletsPerRole: [], sectionOrder: order },
      findings: [
        makeFinding('structure', {
          severity: 'critical',
          message: 'No work experience entries could be identified',
          suggestion: 'List each role as "Title — Company | Start – End" followed by bullets.',
        }),
      ],
    }
  }

  let penalty = 0

  if (pages > pageLimit) {
    const big = pages > pageLimit + 1
    penalty += big ? 15 : 8
    findings.push(makeFinding('structure', {
      severity: big ? 'major' : 'minor',
      message: `CV is about ${pages} pages — ${pageLimit} page${pageLimit > 1 ? 's' : ''} is the norm at ${years} years of experience`,
      suggestion: 'Trim older roles to 1–2 bullets and cut anything that does not support the target role.',
    }))
  }

  const starts = cv.roles.map((r) => r.start)
  let reverseChronological = true
  for (let i = 0; i + 1 < starts.length; i++) {
    const a = starts[i]
    const b = starts[i + 1]
    if (a && b && a < b) reverseChronological = false
  }
  if (!reverseChronological) {
    penalty += 15
    findings.push(makeFinding('structure', {
      severity: 'major',
      message: "Roles aren't in reverse-chronological order",
      suggestion: 'List your most recent role first — recruiters and ATS expect it.',
    }))
  }

  let datePenalty = 0
  cv.roles.forEach((r, i) => {
    const label = [r.title, r.company].filter(Boolean).join(' at ') || `Role ${i + 1}`
    if (!r.start) {
      datePenalty += 5
      findings.push(makeFinding('structure', {
        severity: 'minor',
        message: `Missing or unreadable start date for "${label}"`,
        location: { section: 'Experience', index: i, excerpt: label },
        suggestion: 'Use a consistent format such as "Jan 2021 – Present".',
      }))
    } else if (r.end && r.end !== 'present' && r.end < r.start) {
      datePenalty += 5
      findings.push(makeFinding('structure', {
        severity: 'major',
        message: `End date is before start date for "${label}"`,
        location: { section: 'Experience', index: i, excerpt: label },
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
      suggestion: 'Briefly explain longer gaps (study, relocation, caregiving, freelance) so they don\'t raise questions.',
    }))
    return { between, months: g.months }
  })

  const bulletsPerRole = cv.roles.map((r) => r.bullets.length)
  let bulletPenalty = 0
  const offRange: string[] = []
  cv.roles.slice(0, RECENT_ROLES).forEach((r, i) => {
    const n = r.bullets.length
    const label = [r.title, r.company].filter(Boolean).join(' at ') || `Role ${i + 1}`
    if (n === 0) {
      bulletPenalty += 8
      findings.push(makeFinding('structure', {
        severity: 'major',
        message: `"${label}" has no bullets`,
        location: { section: 'Experience', index: i, excerpt: label },
        suggestion: 'Add 3–6 achievement bullets for each recent role.',
      }))
    } else if (n < 3 || n > 6) {
      bulletPenalty += 4
      offRange.push(`${label} (${n})`)
    }
  })
  if (offRange.length) {
    findings.push(makeFinding('structure', {
      severity: 'minor',
      message: `Recent roles outside the ideal 3–6 bullets: ${offRange.join(', ')}`,
      suggestion: 'Aim for 3–6 focused bullets per recent role.',
    }))
  }
  penalty += Math.min(20, bulletPenalty)

  const eduIdx = order.indexOf('education')
  const expIdx = order.indexOf('experience')
  if (years >= 2 && eduIdx !== -1 && expIdx !== -1 && eduIdx < expIdx) {
    penalty += 5
    findings.push(makeFinding('structure', {
      severity: 'minor',
      message: 'Education appears before Experience',
      suggestion: 'With 2+ years of experience, lead with Experience — it is what recruiters look for first.',
    }))
  }

  return {
    score: clamp(100 - penalty),
    details: { years, pages, pageLimit, reverseChronological, gaps: gapDetails, bulletsPerRole, sectionOrder: order },
    findings,
  }
}
