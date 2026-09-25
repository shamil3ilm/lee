/**
 * v12.0 — Seniority alignment (Experience Match component).
 *
 * score = 0.65 × years-vs-required + 0.35 × scope signals vs level
 * (years component omitted — scope only — when the JD states neither years
 * nor a recognisable level).
 */
import { experienceYears } from '../career'
import { makeFinding } from '../findings'
import { SCOPE_SIGNALS, SENIORITY_LADDER, seniorityKey } from '../lexicon'
import type { CvFinding, DimensionResult, JobTarget, ScorableCv, ScoreContext } from '../types'

export interface SeniorityDetails {
  years: number
  yearsSource: 'cv' | 'profile' | 'none'
  requiredYears: number | null
  jdLevel: string | null
  cvLevel: string | null
  scopeSignals: number
  expectedScope: number
  yearsScore: number | null
  scopeScore: number
}

const YEARS_RE = /(\d{1,2})\s*\+?\s*(?:-|–|to)?\s*(?:\d{1,2})?\s*\+?\s*(?:years?|yrs?)\b/gi
const SCOPE_RE = new RegExp(`\\b(?:${SCOPE_SIGNALS.join('|')})\\b`, 'i')

/** Smallest "N+ years" figure in the JD (requirements first, then description). */
export function requiredYearsFromJd(target: JobTarget): number | null {
  const found: number[] = []
  for (const text of [target.requirements.join('\n'), target.descriptionMd]) {
    for (const m of text.matchAll(YEARS_RE)) {
      const n = Number(m[1])
      if (n >= 1 && n <= 20) found.push(n)
    }
    if (found.length) break
  }
  return found.length ? Math.min(...found) : null
}

export function scoreSeniority(
  cv: ScorableCv,
  target: JobTarget,
  ctx: Pick<ScoreContext, 'now' | 'profile'>,
): DimensionResult<SeniorityDetails> {
  const findings: CvFinding[] = []
  let years = experienceYears(cv.roles, ctx.now)
  let yearsSource: SeniorityDetails['yearsSource'] = 'cv'
  if (years === 0 && ctx.profile?.yearsExperience) {
    years = ctx.profile.yearsExperience
    yearsSource = 'profile'
  } else if (years === 0) yearsSource = 'none'

  const jdLevel = seniorityKey(target.seniority) ?? seniorityKey(target.title) ?? null
  const ladder = jdLevel ? SENIORITY_LADDER[jdLevel] : undefined
  const requiredYears = requiredYearsFromJd(target)
  const expectedYears = requiredYears ?? (ladder && ladder.minYears > 0 ? ladder.minYears : null)
  const cvLevel = seniorityKey(cv.roles[0]?.title) ?? seniorityKey(cv.headline) ?? null

  let yearsScore: number | null = null
  if (expectedYears !== null) {
    yearsScore = years >= expectedYears ? 100 : Math.round((years / expectedYears) * 100)
    if (years < expectedYears) {
      findings.push(makeFinding('seniority', {
        severity: years < expectedYears * 0.6 ? 'major' : 'minor',
        message: `Role asks for ${expectedYears}+ years; your CV shows about ${years}`,
        suggestion: 'Surface all relevant experience (internships, freelance, open source) with dates, or target a level that matches.',
      }))
    }
  }
  if (ladder && ladder.rank <= 2 && years >= ladder.minYears + 6) {
    yearsScore = 80
    findings.push(makeFinding('seniority', {
      severity: 'minor',
      message: `This looks like a ${jdLevel}-level role and you have ~${years} years — you may read as over-qualified`,
      suggestion: 'Explain the move in your summary or cover letter, or target a more senior opening.',
    }))
  }

  const scopeSignals = cv.bullets.filter((b) => SCOPE_RE.test(b.text)).length
  const expectedScope = ladder?.scope ?? 1
  const scopeScore = expectedScope === 0 ? 100 : Math.round(Math.min(1, scopeSignals / expectedScope) * 100)
  if (scopeSignals < expectedScope) {
    findings.push(makeFinding('seniority', {
      severity: 'minor',
      message: `${jdLevel ? `${jdLevel[0]!.toUpperCase()}${jdLevel.slice(1)}` : 'This'} role expects ownership signals — only ${scopeSignals} bullet(s) show scope (led, owned, architected, mentored)`,
      suggestion: 'Where true, make ownership explicit: what you led, designed or owned, and for whom.',
    }))
  }

  const score = yearsScore === null ? scopeScore : Math.round(0.65 * yearsScore + 0.35 * scopeScore)
  return {
    score,
    details: { years, yearsSource, requiredYears, jdLevel, cvLevel, scopeSignals, expectedScope, yearsScore, scopeScore },
    findings,
  }
}
