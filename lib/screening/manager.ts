import { requirementChecks, responsibilitiesComponent } from '@/lib/discovery/match/coverage'
import type { RequirementCheck } from '@/lib/discovery/match/types'
import { resolveHighlight } from '@/lib/resume/readiness'
import type { ResumeProfile } from '@/lib/resume/types'
import type { ScreenContext } from './input'
import type { StageCheck, StageResult, StageStatus } from './types'

/**
 * Stage (d): the hiring manager's depth check. Read-only over the Match
 * Score's requirement checks (the stored detail when there is one), split
 * by readiness:
 *   met, interview-ready  the backing line is an interview-ready item;
 *   met, domain-only      backed only by a domain-ready item: explain it as
 *                         design / domain work (fact-lock rules);
 *   partial / missing.
 * Score = Σ must-have credit (interview 1 · domain 0.7 · partial 0.5) / n,
 * blended 70/30 with the responsibilities overlap. No ceiling: this is the
 * ranking signal among postings that get past (a)–(c).
 */

const CREDIT = { interview: 1, domain: 0.7, partial: 0.5, missing: 0 } as const

/** Domain-only texts (as shown), to tell a domain-backed requirement from an interview-ready one. */
function domainOnlyTexts(resume: ResumeProfile | null): string[] {
  if (!resume) return []
  const out: string[] = []
  for (const item of [...resume.work, ...resume.projects]) {
    for (const h of item.highlights) {
      const r = resolveHighlight(h, null)
      if (r?.mode === 'domain') out.push(r.text)
    }
  }
  return out
}

function isDomainBacked(evidence: string | undefined, domain: readonly string[]): boolean {
  if (!evidence) return false
  const stem = evidence.replace(/…$/, '').trim()
  return stem.length > 0 && domain.some((d) => d.startsWith(stem) || stem.startsWith(d))
}

type Kind = keyof typeof CREDIT

function kindOf(r: RequirementCheck, domain: readonly string[]): Kind | null {
  if (r.status === 'unchecked') return null
  if (r.status === 'met') return isDomainBacked(r.evidence, domain) ? 'domain' : 'interview'
  return r.status
}

function checkOf(r: RequirementCheck, kind: Kind, i: number): StageCheck {
  const key = `req:${i}`
  if (kind === 'interview') return { key, status: 'pass', reason: `${r.text} · interview-ready` }
  if (kind === 'domain') {
    return { key, status: 'pass', reason: `${r.text} · domain-only`, action: { kind: 'prepare', label: `Explain “${r.text}” as design / domain work` } }
  }
  if (kind === 'partial') return { key, status: 'at_risk', reason: `${r.text} · partly shown`, short: 'partial must-haves' }
  return { key, status: 'fail', reason: `${r.text} · no ready evidence`, short: 'must-haves missing', action: { kind: 'study', label: `Study: ${r.text}` } }
}

export function managerStage(ctx: ScreenContext): StageResult {
  const reqs = ctx.detail?.requirements ?? requirementChecks(ctx.jd, ctx.profile)
  const domain = domainOnlyTexts(ctx.resume)
  const must = reqs
    .filter((r) => r.weight === 'must')
    .map((r) => ({ r, kind: kindOf(r, domain) }))
    .filter((x): x is { r: RequirementCheck; kind: Kind } => x.kind !== null)
  if (must.length === 0) {
    return { stage: 'manager', status: 'unknown', score: 0.9, summary: 'No checkable must-haves in the JD', checks: [] }
  }
  const credit = must.reduce((s, x) => s + CREDIT[x.kind], 0) / must.length
  const resp = ctx.detail?.components.find((c) => c.key === 'responsibilities') ?? responsibilitiesComponent(ctx.jd, ctx.profile)
  const respShare = resp.max > 0 ? resp.points / resp.max : credit
  const score = Math.round((0.7 * credit + 0.3 * respShare) * 100) / 100
  const status: StageStatus = score >= 0.7 ? 'pass' : score >= 0.4 ? 'at_risk' : 'fail'
  const count = (k: Kind): number => must.filter((x) => x.kind === k).length
  const parts = [`${count('interview')} of ${must.length} must-haves interview-ready`]
  if (count('domain') > 0) parts.push(`${count('domain')} domain-only`)
  if (count('missing') > 0) parts.push(`${count('missing')} missing`)
  const domainLabel = ctx.detail?.components.find((c) => c.key === 'domain' && c.points > 0)?.label
  if (domainLabel) parts.push(domainLabel.replace(/^Domain: /, '') + ' matches')
  const short = count('missing') > 0 ? `${count('missing')} must-haves missing` : `${count('partial')} partly shown`
  return {
    stage: 'manager',
    status,
    score,
    summary: parts.join(' · '),
    ...(status !== 'pass' ? { short } : {}),
    checks: must.map((x, i) => checkOf(x.r, x.kind, i)),
  }
}
