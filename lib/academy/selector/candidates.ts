import { localDay, daysBetween } from '@/lib/academy/day'
import { levelName } from '@/lib/academy/levels'
import { DEFAULT_DEVIATION, DEFAULT_RATING } from '@/lib/academy/rating'
import { byTargetDate, targetDay } from '@/lib/academy/placement/study'
import { shortDay } from '@/lib/ui/date'
import { chooseItem, itemMinutes, STRETCH_SUCCESS, TARGET_SUCCESS } from './choose-item'
import { INTERVIEW_WINDOW_DAYS, domainsForStage, stageKindLabel } from './interviews'
import type { PlanInputs, PlanItem, PlanItemKind, SkillState } from './types'

/**
 * Candidate plan items, one builder per signal, each with its reason. The
 * plan (./plan.ts) orders them and applies the budget. Pure.
 */

export type Used = ReadonlySet<string>

function stateOf(inp: PlanInputs, skillId: string): SkillState {
  return (
    inp.ratings.get(skillId) ?? {
      skillId,
      rating: DEFAULT_RATING,
      deviation: DEFAULT_DEVIATION,
      level: 0,
      attempts: 0,
      lastPracticedAt: null,
    }
  )
}

/** Today's coding problem (the daily problem), done once it is solved. */
export function codingCandidate(inp: PlanInputs): PlanItem | null {
  const c = inp.coding
  if (!c) return null
  return {
    id: `coding:${c.slug}`,
    kind: 'coding',
    skillId: c.skillId,
    itemId: c.slug,
    minutes: c.minutes,
    title: c.title,
    reasons: [{ code: 'coding', text: 'Today\u2019s coding problem, picked near 70% expected success for your rating in this skill.' }],
    status: c.solved ? 'done' : 'todo',
    attemptId: null,
  }
}

function skillName(inp: PlanInputs, skillId: string): string {
  return inp.content.graph.byId.get(skillId)?.name ?? skillId
}

/** Lower confidence bound: low for weak AND for uncertain skills. */
function lcb(s: SkillState): number {
  return s.rating - s.deviation / 2
}

function practiceItem(
  inp: PlanInputs,
  kind: PlanItemKind,
  skillId: string,
  text: string,
  target = TARGET_SUCCESS,
): PlanItem | null {
  const item = chooseItem(inp.content, skillId, stateOf(inp, skillId).rating, inp.recentItemIds, target)
  if (!item) return null
  return {
    id: `${kind}:${skillId}`,
    kind,
    skillId,
    itemId: item.id,
    minutes: itemMinutes(item),
    title: skillName(inp, skillId),
    reasons: [{ code: kind, text }],
    status: 'todo',
    attemptId: null,
  }
}

export function placementCandidate(inp: PlanInputs): PlanItem | null {
  if (inp.placement.done) return null
  const n = Math.max(1, inp.placement.remaining)
  return {
    id: 'placement:placement',
    kind: 'placement',
    skillId: null,
    itemId: null,
    minutes: Math.min(15, Math.ceil(n * 1.2)),
    title: 'Placement check',
    reasons: [{ code: 'placement', text: `${n} quick placement items left so the plan matches your level; your profile only seeds a starting point.` }],
    status: 'todo',
    attemptId: null,
  }
}

export function reviewCandidate(inp: PlanInputs): PlanItem | null {
  if (inp.dueReviews <= 0) return null
  const n = inp.dueReviews
  return {
    id: 'review:review',
    kind: 'review',
    skillId: null,
    itemId: null,
    minutes: Math.min(10, Math.max(2, Math.ceil(n * 0.5))),
    title: 'Concept card review',
    reasons: [{ code: 'review', text: `${n} concept card${n === 1 ? ' is' : 's are'} due for spaced review today.` }],
    status: 'todo',
    attemptId: null,
  }
}

function whenText(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

export function interviewCandidates(inp: PlanInputs, used: Used, max: number): PlanItem[] {
  const tz = inp.timeZone ?? 'UTC'
  const upcoming = inp.interviews
    .filter((i) => i.scheduledAt.getTime() >= inp.now.getTime())
    .map((i) => ({ i, days: daysBetween(inp.today, localDay(i.scheduledAt, tz)) }))
    .filter((x) => x.days <= INTERVIEW_WINDOW_DAYS)
    .sort((a, b) => a.i.scheduledAt.getTime() - b.i.scheduledAt.getTime())
  const out: PlanItem[] = []
  const taken = new Set(used)
  for (const { i, days } of upcoming) {
    if (out.length >= max) break
    const domains = domainsForStage(i.kind)
    const skills = inp.content.graph.skills
      .filter((s) => domains.includes(s.domain) && !taken.has(s.id) && inp.content.itemsBySkill.has(s.id))
      .map((s) => stateOf(inp, s.id))
      .sort((a, b) => lcb(a) - lcb(b))
    const weakest = skills[0]
    if (!weakest) continue
    const at = i.company ? ` at ${i.company}` : ''
    const level = weakest.level > 0 ? levelName(weakest.level) : 'not assessed yet'
    const text = `${stageKindLabel(i.kind)} interview${at} ${whenText(days)}: practising ${skillName(inp, weakest.skillId)}, your weakest mapped skill (${level}).`
    const item = practiceItem(inp, 'interview', weakest.skillId, text)
    if (item) {
      out.push(item)
      taken.add(weakest.skillId)
    }
  }
  return out
}

function targetText(label: string, targetDate: string, today: string): string {
  const day = targetDay(targetDate)
  if (!day) return `On your study list: “${label}” (no target date).`
  const shown = shortDay(day)
  return daysBetween(today, day) < 0
    ? `On your study list: “${label}” (target ${shown}, overdue).`
    : `On your study list: “${label}” (target ${shown}).`
}

export function studyCandidates(inp: PlanInputs, used: Used, max: number): PlanItem[] {
  const out: PlanItem[] = []
  const taken = new Set(used)
  for (const t of [...inp.studyTargets].sort(byTargetDate)) {
    if (out.length >= max) break
    if (taken.has(t.skillId)) continue
    const item = practiceItem(inp, 'study', t.skillId, targetText(t.label, t.targetDate, inp.today))
    if (item) {
      out.push(item)
      taken.add(t.skillId)
    }
  }
  return out
}

function assessed(inp: PlanInputs, used: Used): SkillState[] {
  return [...inp.ratings.values()].filter((s) => s.level > 0 && !used.has(s.skillId) && inp.content.itemsBySkill.has(s.skillId))
}

export function weaknessCandidate(inp: PlanInputs, used: Used): PlanItem | null {
  const weakest = assessed(inp, used).sort((a, b) => a.rating - b.rating)[0]
  if (!weakest) return null
  const text = `Weak spot: ${skillName(inp, weakest.skillId)} is ${levelName(weakest.level)} (rating ${Math.round(weakest.rating)}).`
  return practiceItem(inp, 'weakness', weakest.skillId, text)
}

const UNCERTAIN_DEVIATION = 250

export function uncertainCandidate(inp: PlanInputs, used: Used): PlanItem | null {
  const s = assessed(inp, used)
    .filter((x) => x.deviation >= UNCERTAIN_DEVIATION)
    .sort((a, b) => b.deviation - a.deviation)[0]
  if (!s) return null
  const text = `Level not settled: ${skillName(inp, s.skillId)} (±${Math.round(s.deviation)}); one more data point sharpens it.`
  return practiceItem(inp, 'uncertain', s.skillId, text)
}

/** Next skills on the path: every prerequisite Competent, the skill itself below it. */
function frontier(inp: PlanInputs, used: Used): string[] {
  return inp.content.graph.skills
    .filter((s) => s.prerequisites.length > 0 && !used.has(s.id) && stateOf(inp, s.id).level < 3)
    .filter((s) => s.prerequisites.every((p) => stateOf(inp, p).level >= 3))
    .map((s) => s.id)
}

export function stretchCandidate(inp: PlanInputs, used: Used): PlanItem | null {
  const next = frontier(inp, used)[0]
  if (next) {
    const prereqs = inp.content.graph.byId.get(next)?.prerequisites.map((p) => skillName(inp, p)).join(', ') ?? ''
    return practiceItem(inp, 'stretch', next, `Stretch: you're Competent in ${prereqs}, so ${skillName(inp, next)} is next on the path.`, STRETCH_SUCCESS)
  }
  const strongest = assessed(inp, used).sort((a, b) => b.rating - a.rating)[0]
  if (strongest) {
    const text = `Stretch: a harder item in your strongest skill, ${skillName(inp, strongest.skillId)} (${levelName(strongest.level)}).`
    return practiceItem(inp, 'stretch', strongest.skillId, text, STRETCH_SUCCESS)
  }
  const root = inp.content.graph.skills.find((s) => s.prerequisites.length === 0 && !used.has(s.id))
  if (!root) return null
  return practiceItem(inp, 'stretch', root.id, `Start here: ${root.name} is a base of the ${inp.content.graph.domainById.get(root.domain)?.name ?? ''} path.`)
}
