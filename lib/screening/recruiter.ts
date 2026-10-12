import { employmentGaps } from '@/lib/cv-score/career'
import type { ScorableRole } from '@/lib/cv-score/types'
import { seniorityComponent } from '@/lib/discovery/match/fit'
import { skillsInText, withImplied } from '@/lib/discovery/match/lexicon'
import { jdFamilies, OFF_TARGET_ROLE_POINTS, roleOffTargetLabel } from '@/lib/discovery/match/role'
import { classifyRole, roleFamilyLabel } from '@/lib/discovery/relevance/roles'
import { readyHighlights } from '@/lib/resume/readiness'
import type { ResumeProfile, WorkItem } from '@/lib/resume/types'
import type { ScreenContext } from './input'
import { STATUS_SCORE } from './stage'
import type { StageCheck, StageResult, StageStatus } from './types'

/**
 * Stage (c): the recruiter's 30-second scan — current title, relevant and
 * recent years, level, results, the timeline. Title alignment caps the
 * stage: a title that doesn't read as the requisition rarely gets past the
 * scan. A "not a tech role" title is the role ceiling's job (in progress
 * elsewhere): this stage reads the stored Match detail's role reason, it
 * never re-decides it.
 */

/** Families a recruiter reads as the same kind of hire. */
const ADJACENT: ReadonlyArray<readonly [string, string]> = [
  ['backend', 'fullstack'],
  ['frontend', 'fullstack'],
  ['backend', 'api_integration'],
  ['backend', 'payments'],
  ['backend', 'einvoicing'],
  ['api_integration', 'payments'],
  ['api_integration', 'einvoicing'],
  ['payments', 'einvoicing'],
  ['backend', 'erp'],
  ['data_analyst', 'analytics_eng'],
  ['data_analyst', 'data'],
  ['analytics_eng', 'data'],
  ['ml', 'llm_app'],
  ['solutions', 'implementation'],
]

function adjacent(a: string, b: string): boolean {
  return a === b || ADJACENT.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
}

function toMonth(d: string): string | undefined {
  if (!d) return undefined
  return d.length >= 7 ? d.slice(0, 7) : `${d}-01`
}

/** Dated résumé roles, most recent first (an open-ended role counts as now). */
export function datedRoles(resume: ResumeProfile | null): WorkItem[] {
  return [...(resume?.work ?? [])]
    .filter((w) => w.startDate)
    .sort((a, b) => (b.endDate || '9999').localeCompare(a.endDate || '9999') || b.startDate.localeCompare(a.startDate))
}

function monthIndex(ym: string): number {
  const [y, m] = ym.split('-').map(Number)
  return (y ?? 0) * 12 + ((m ?? 1) - 1)
}

/** Recency weights (spec §3.4): last 3 years ×1.0, 3–6 years ×0.6, older ×0.3. */
export function recencyWeight(monthsAgo: number): number {
  if (monthsAgo < 36) return 1
  if (monthsAgo < 72) return 0.6
  return 0.3
}

/**
 * Relevant years, recency-weighted: months of every role whose title,
 * keywords or READY highlights name one of `skills` (the JD's asks),
 * overlaps merged (a month counts once). With no skills to look for, every
 * dated role counts.
 */
export function relevantYears(resume: ResumeProfile | null, skills: ReadonlySet<string>, now: Date): number {
  const nowIdx = now.getUTCFullYear() * 12 + now.getUTCMonth()
  const months = new Set<number>()
  for (const w of datedRoles(resume)) {
    const text = [w.position, ...w.keywords, ...readyHighlights(w.highlights).map((h) => h.text)].join(' | ')
    // A Laravel role is PHP experience too (implied skills count for years, as a recruiter reads them).
    const named = withImplied(skillsInText(text))
    if (skills.size > 0 && ![...skills].some((s) => named.has(s))) continue
    const start = monthIndex(toMonth(w.startDate)!)
    const end = w.endDate ? monthIndex(toMonth(w.endDate)!) : nowIdx
    for (let m = start; m <= Math.min(end, nowIdx); m++) months.add(m)
  }
  let weighted = 0
  for (const m of months) weighted += recencyWeight(nowIdx - m)
  return Math.round((weighted / 12) * 10) / 10
}

/**
 * The Match Score's role ceiling, read as a recruiter fail with the same
 * reason text: "Not a tech role: …" / "Role outside your targets: …".
 * The stored ceiling holds only the lowest one, so the role component is
 * read too (points 0 = not tech; ≤ OFF_TARGET_ROLE_POINTS = off target).
 */
export function roleCeilingReason(ctx: Pick<ScreenContext, 'job' | 'detail'>): { reason: string; short: string } | null {
  const stored = ctx.detail?.ceiling?.reason ?? ''
  if (stored.startsWith('Not a tech role')) return { reason: stored, short: 'not a tech role' }
  if (stored.startsWith('Role outside your targets')) return { reason: stored, short: 'outside your targets' }
  const role = ctx.detail?.components.find((c) => c.key === 'role')
  if (!role) return null
  if (role.points === 0) return { reason: `Not a tech role: ${ctx.job.title}`, short: 'not a tech role' }
  if (role.points <= OFF_TARGET_ROLE_POINTS) return { reason: `Role outside your targets: ${roleOffTargetLabel(role.label)}`, short: 'outside your targets' }
  return null
}

function titleCheck(ctx: ScreenContext): StageCheck {
  const ceiling = roleCeilingReason(ctx)
  if (ceiling) return { key: 'title', status: 'fail', reason: ceiling.reason, short: ceiling.short }
  if (ctx.needsLook) {
    return {
      key: 'title',
      status: 'at_risk',
      reason: 'Needs a look: lee is unsure this title is your kind of role',
      short: 'needs a look',
      action: { kind: 'prepare', label: 'Read the JD: is this your kind of role?' },
    }
  }
  const recent = datedRoles(ctx.resume)[0]
  if (!recent) return { key: 'title', status: 'unknown', reason: 'No dated work history on your profile', short: 'title', action: { kind: 'prepare', label: 'Add your work history to Profile › Experience' } }
  const yours = classifyRole({ title: recent.position })
  const job = classifyRole({ title: ctx.job.title, description: ctx.job.descriptionMd, techStack: ctx.job.techStack })
  const jobFamilies = [...new Set([...job.families, ...jdFamilies(ctx.job, ctx.jd)])]
  const pair = `${recent.position} → ${ctx.job.title}`
  if (!yours.engineering && job.engineering) {
    return { key: 'title', status: 'fail', reason: `${pair}: your recent title doesn’t read as a tech role`, short: 'title' }
  }
  if (jobFamilies.length === 0 || yours.families.length === 0) return { key: 'title', status: 'pass', reason: pair }
  const hit = yours.families.find((f) => jobFamilies.some((j) => adjacent(f, j)))
  if (hit) return { key: 'title', status: 'pass', reason: pair }
  return {
    key: 'title',
    status: 'at_risk',
    reason: `${pair}: ${roleFamilyLabel(yours.families[0]!)} vs ${roleFamilyLabel(jobFamilies[0]!)}`,
    short: 'title alignment',
    action: { kind: 'prepare', label: 'Lead the headline with the work that matches this role (truthfully)' },
  }
}

function yearsCheck(ctx: ScreenContext): StageCheck {
  const must = new Set(ctx.jd.must.flatMap((l) => l.skills))
  const asks = must.size > 0 ? must : new Set(ctx.jd.stack)
  const years = relevantYears(ctx.resume, asks, ctx.now)
  const ask = ctx.jd.years
  const yrs = `${years} relevant yr${years === 1 ? '' : 's'}`
  if (ctx.resume === null || datedRoles(ctx.resume).length === 0) {
    return { key: 'years', status: 'unknown', reason: 'No dated roles to count relevant years', short: 'relevant years' }
  }
  if (ask === null) {
    return years >= 1
      ? { key: 'years', status: 'pass', reason: `${yrs} (no years asked)` }
      : { key: 'years', status: 'at_risk', reason: `${yrs} in this stack`, short: 'relevant years' }
  }
  if (years >= ask - 1) return { key: 'years', status: 'pass', reason: `${yrs} (asks ${ask}+)` }
  if (years >= 0.6 * ask) return { key: 'years', status: 'at_risk', reason: `${yrs} (asks ${ask}+)`, short: 'years asked', action: { kind: 'prepare', label: `Prepare: why ${years} years in this stack is enough` } }
  return { key: 'years', status: 'fail', reason: `${yrs} (asks ${ask}+)`, short: 'years asked' }
}

function seniorityCheck(ctx: ScreenContext): StageCheck {
  const c = ctx.detail?.components.find((x) => x.key === 'seniority') ?? seniorityComponent(ctx.job, ctx.profile, ctx.jd)
  const label = c.label.replace(/^Seniority: /, 'Level: ')
  const share = c.max > 0 ? c.points / c.max : 1
  if (share >= 0.8) return { key: 'seniority', status: 'pass', reason: label }
  if (share >= 0.25) return { key: 'seniority', status: 'at_risk', reason: label, short: 'seniority' }
  return { key: 'seniority', status: 'fail', reason: label, short: 'seniority' }
}

const NUMBER = /\d/

/** Share of the CV's bullets with a number or outcome; at risk under 30% (only with 3+ bullets). */
function impactCheck(ctx: ScreenContext): StageCheck | null {
  if (!ctx.variant) return null
  const bullets = ctx.variant.evidence.evidence.filter((l) => !/^Skills:/.test(l) && !/: .*\(.*\)$/.test(l))
  if (bullets.length < 3) return null
  const quantified = bullets.filter((b) => NUMBER.test(b)).length
  const share = quantified / bullets.length
  const reason = `${quantified} of ${bullets.length} bullets show a number`
  if (share >= 0.3) return { key: 'impact', status: 'pass', reason }
  return { key: 'impact', status: 'at_risk', reason, short: 'quantify results', action: { kind: 'quantify', label: 'Quantify 2 bullets (numbers only from you; lee never invents them)' } }
}

function gapCheck(ctx: ScreenContext): StageCheck | null {
  const roles: ScorableRole[] = datedRoles(ctx.resume).map((w) => ({
    company: w.name,
    title: w.position,
    start: toMonth(w.startDate),
    end: toMonth(w.endDate) ?? 'present',
    bullets: [],
  }))
  if (roles.length < 2) return null
  const gaps = employmentGaps(roles, ctx.now)
  if (gaps.length === 0) return null
  const longest = Math.max(...gaps.map((g) => g.months))
  return { key: 'gaps', status: 'at_risk', reason: `A ${longest}-month gap between roles: be ready to explain it`, short: 'employment gap', action: { kind: 'prepare', label: 'Prepare a one-line reason for the gap' } }
}

const SIGNAL_SCORE: Readonly<Record<StageStatus, number>> = { pass: 1, at_risk: 0.6, fail: 0.2, unknown: 0.8 }

export function recruiterStage(ctx: ScreenContext): StageResult {
  const title = titleCheck(ctx)
  const checks = [title, yearsCheck(ctx), seniorityCheck(ctx), impactCheck(ctx), gapCheck(ctx)].filter((c): c is StageCheck => c !== null)
  const mean = checks.reduce((s, c) => s + SIGNAL_SCORE[c.status], 0) / checks.length
  const score = Math.round(Math.min(mean, SIGNAL_SCORE[title.status]) * 100) / 100
  // Gaps and impact are "be ready" items: they never make the stage worse than at risk, and
  // the title / years / level decide a fail.
  const decisive = checks.filter((c) => c.key === 'title' || c.key === 'years' || c.key === 'seniority')
  const order: readonly StageStatus[] = ['fail', 'at_risk', 'unknown']
  const status = order.find((s) => checks.some((c) => c.status === s && (s !== 'fail' || decisive.includes(c)))) ?? 'pass'
  const summary = [title.reason, checks.find((c) => c.key === 'years')?.reason].filter(Boolean).join(' · ')
  return { stage: 'recruiter', status, score: Number.isFinite(score) ? score : STATUS_SCORE.unknown, summary, checks }
}
