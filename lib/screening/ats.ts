import { extractRequirements, REQ_WEIGHTS, type Requirement } from '@/lib/discovery/match/requirements'
import { isConcept, skillLabel, skillsInText } from '@/lib/discovery/match/lexicon'
import { excerpt } from '@/lib/cv-score/text'
import type { ScreenContext } from './input'
import type { StageCheck, StageResult, StageStatus } from './types'

/**
 * Stage (b): what an ATS and a recruiter's keyword search see — the TEXT of
 * the CV you would send, not lee's synonym-aware profile. Each skill the JD
 * names is checked literally against the best CV variant (spelling variants
 * the parsers normalise count: case, "Node.js"/"NodeJS", plurals). Concept
 * and sibling credit (Laravel ≈ "a PHP framework", MySQL ≈ PostgreSQL) and
 * implied skills (Laravel → PHP) do NOT count here: a keyword search may not
 * know them. They count in the manager stage.
 *
 * Buckets per term:
 *   present   the CV shows it;
 *   addable   your ready evidence has it, this CV doesn't say it → an honest
 *             "add it" action naming where you have it;
 *   missing   no ready evidence → a study item, NEVER a keyword to add.
 *
 * Status on literal MUST-HAVE coverage: pass ≥ 0.7 as is · at risk when ≥
 * 0.5 (≥ 0.7 only after the honest additions, or 0.5–0.7 after them) ·
 * fail < 0.5 even after them.
 */

export type TermBucket = 'present' | 'addable' | 'missing'

export interface AtsTerm {
  canonical: string
  /** As the JD spells it ("PostgreSQL", "CI/CD"). */
  label: string
  weight: Requirement['weight']
  bucket: TermBucket
  /** A ready evidence line that backs an "addable" term. */
  evidence?: string
}

export const ATS_PASS = 0.7
export const ATS_FAIL = 0.5

/** The JD's own spelling of a skill when it appears verbatim, else the lexicon label. */
function jdSpelling(canonical: string, jdText: string): string {
  const label = skillLabel(canonical)
  const at = jdText.toLowerCase().indexOf(label.toLowerCase())
  return at >= 0 ? jdText.slice(at, at + label.length) : label
}

function evidenceLine(canonical: string, lines: readonly string[]): string | undefined {
  const line = lines.find((l) => skillsInText(l).has(canonical))
  return line ? excerpt(line, 80) : undefined
}

function termOf(r: Requirement, cvTerms: ReadonlySet<string>, ctx: ScreenContext, jdText: string): AtsTerm {
  const members = r.anyOf ?? [r.canonical]
  const label = members.map((m) => jdSpelling(m, jdText)).join(' or ')
  if (members.some((m) => cvTerms.has(m))) return { canonical: r.canonical, label, weight: r.weight, bucket: 'present' }
  const have = members.find((m) => ctx.profile.skills.has(m))
  if (have) {
    const ev = evidenceLine(have, ctx.profile.evidence)
    return { canonical: r.canonical, label: jdSpelling(have, jdText), weight: r.weight, bucket: 'addable', ...(ev ? { evidence: ev } : {}) }
  }
  return { canonical: r.canonical, label, weight: r.weight, bucket: 'missing' }
}

/** Literal terms of the CV text: what a keyword search can hit (no implied skills). */
export function literalTerms(lines: readonly string[]): Set<string> {
  return skillsInText(lines.join('\n'))
}

export function atsTerms(ctx: ScreenContext): AtsTerm[] {
  const jdText = `${ctx.job.title}\n${ctx.job.descriptionMd ?? ''}`
  // Without a variant the ready profile stands in for the CV (nothing is "addable" then).
  const cvLines = ctx.variant ? ctx.variant.evidence.evidence : ctx.profile.evidence
  const cvTerms = literalTerms(cvLines)
  return extractRequirements(ctx.job, ctx.jd)
    .filter((r) => !(r.anyOf ?? [r.canonical]).every(isConcept))
    .map((r) => termOf(r, cvTerms, ctx, jdText))
}

interface Coverage {
  now: number
  after: number
  total: number
}

function coverage(terms: readonly AtsTerm[]): Coverage {
  const total = terms.reduce((s, t) => s + REQ_WEIGHTS[t.weight], 0)
  if (total === 0) return { now: 0, after: 0, total: 0 }
  const now = terms.filter((t) => t.bucket === 'present').reduce((s, t) => s + REQ_WEIGHTS[t.weight], 0)
  const added = terms.filter((t) => t.bucket === 'addable').reduce((s, t) => s + REQ_WEIGHTS[t.weight], 0)
  return { now: now / total, after: (now + added) / total, total }
}

export function atsStatus(must: Pick<Coverage, 'now' | 'after'>): StageStatus {
  if (must.now >= ATS_PASS) return 'pass'
  if (must.after < ATS_FAIL) return 'fail'
  return 'at_risk'
}

function checkOf(t: AtsTerm, cvName: string): StageCheck {
  const key = `keyword:${t.canonical}`
  if (t.bucket === 'present') return { key, status: 'pass', reason: `${t.label} is in ${cvName}` }
  if (t.bucket === 'addable') {
    return {
      key,
      status: 'at_risk',
      reason: `${t.label} isn’t in ${cvName}, but you have it${t.evidence ? ` (“${t.evidence}”)` : ''}`,
      short: `add ${t.label}`,
      action: { kind: 'add_keyword', label: `Add “${t.label}” to the CV${t.evidence ? ` (you have it: ${t.evidence})` : ''}` },
    }
  }
  return {
    key,
    status: t.weight === 'required' ? 'fail' : 'at_risk',
    reason: `${t.label}: no ready evidence${t.weight === 'required' ? ' (must-have)' : ''}`,
    short: `${t.label} missing`,
    action: { kind: 'study', label: `Study ${t.label}` },
  }
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

export function atsStage(ctx: ScreenContext): StageResult {
  const cvName = ctx.variant ? `“${ctx.variant.name}”` : 'your profile (no CV variant yet)'
  if (ctx.jd.confidence === 'title_only') {
    return { stage: 'ats', status: 'unknown', score: 0.9, summary: 'No JD yet: paste or fetch it to check keywords', checks: [] }
  }
  const terms = atsTerms(ctx)
  const required = terms.filter((t) => t.weight === 'required')
  const graded = required.length > 0 ? required : terms
  if (graded.length === 0) {
    return { stage: 'ats', status: 'unknown', score: 0.9, summary: 'The JD names no skills lee can check', checks: [] }
  }
  const must = coverage(graded)
  const status = atsStatus(must)
  const checks = terms.map((t) => checkOf(t, cvName))
  const present = graded.filter((t) => t.bucket === 'present').length
  const addable = graded.filter((t) => t.bucket === 'addable')
  const missing = graded.filter((t) => t.bucket === 'missing')
  const what = required.length > 0 ? 'must-have' : 'skill'
  const parts = [`${present} of ${plural(graded.length, what)} in ${cvName}`]
  if (addable.length > 0) parts.push(`add ${addable.slice(0, 3).map((t) => t.label).join(', ')} (you have ${addable.length === 1 ? 'it' : 'them'})`)
  if (missing.length > 0) parts.push(`${plural(missing.length, what)} missing`)
  // The status follows coverage, not the single worst term (one missing nice-to-have is not a fail).
  // The chip names the count: "ATS: 3 must-haves missing".
  const short = missing.length > 0 ? `${plural(missing.length, what)} missing` : `add ${plural(addable.length, 'keyword')}`
  return {
    stage: 'ats',
    status,
    score: Math.round(coverage(terms).after * 100) / 100,
    summary: parts.join(' · '),
    ...(status !== 'pass' ? { short } : {}),
    checks,
  }
}
