import {
  codingCandidate,
  interviewCandidates,
  placementCandidate,
  reviewCandidate,
  stretchCandidate,
  studyCandidates,
  uncertainCandidate,
  weaknessCandidate,
} from './candidates'
import type { Plan, PlanInputs, PlanItem, PlanMode } from './types'

/**
 * The daily plan (v13 §3.4): ~3–6 items mixing what is due, the next
 * interview, study-list targets, a weak spot and a stretch, inside the
 * user's time budget. Every item carries its reason ("Why this?"). Pure and
 * deterministic: the same inputs give the same plan.
 */

const MODE_LIMITS: Readonly<Record<PlanMode, { maxItems: number; interviews: number; study: number }>> = {
  quick: { maxItems: 3, interviews: 1, study: 1 },
  balanced: { maxItems: 5, interviews: 2, study: 2 },
  deep: { maxItems: 6, interviews: 2, study: 2 },
  sprint: { maxItems: 6, interviews: 3, study: 1 },
}

function usedSkills(items: readonly PlanItem[]): Set<string> {
  return new Set(items.flatMap((i) => (i.skillId ? [i.skillId] : [])))
}

/** Candidates in priority order (each builder skips skills already taken). */
function candidates(inp: PlanInputs): PlanItem[] {
  const limits = MODE_LIMITS[inp.mode]
  const out: PlanItem[] = []
  const push = (x: PlanItem | null | readonly PlanItem[]): void => {
    if (!x) return
    for (const item of Array.isArray(x) ? x : [x]) out.push(item as PlanItem)
  }
  push(placementCandidate(inp))
  push(reviewCandidate(inp))
  push(interviewCandidates(inp, usedSkills(out), limits.interviews))
  if (inp.mode !== 'quick') push(codingCandidate(inp))
  push(studyCandidates(inp, usedSkills(out), limits.study))
  push(weaknessCandidate(inp, usedSkills(out)))
  push(uncertainCandidate(inp, usedSkills(out)))
  push(stretchCandidate(inp, usedSkills(out)))
  return out
}

export function buildPlan(inp: PlanInputs): Plan {
  const { maxItems } = MODE_LIMITS[inp.mode]
  const budget = Math.max(1, inp.timeBudgetMin)
  const items: PlanItem[] = []
  let total = 0
  for (const c of candidates(inp)) {
    if (items.length >= maxItems) break
    // Always offer at least one item, even when it overruns a tiny budget.
    if (items.length > 0 && total + c.minutes > budget) continue
    items.push(c)
    total += c.minutes
  }
  return { items, totalMinutes: total }
}

/**
 * What the plan depends on, minus ratings (so finishing an item doesn't
 * reshuffle the day): a change here regenerates the plan (§3.4 "regenerates
 * if the situation changes").
 */
export function planSignature(inp: PlanInputs): string {
  return JSON.stringify([
    inp.today,
    inp.mode,
    inp.timeBudgetMin,
    inp.dueReviews > 0,
    inp.placement.done,
    inp.interviews.map((i) => [i.stageId, i.kind, i.scheduledAt.toISOString()]),
    inp.studyTargets.map((t) => [t.skillId, t.targetDate]),
    inp.coding ? [inp.coding.slug, inp.coding.solved] : null,
  ])
}

/** A regenerated plan that keeps every finished item from the previous one. */
export function mergePlans(previous: readonly PlanItem[], next: readonly PlanItem[]): PlanItem[] {
  const done = new Map(previous.filter((i) => i.status === 'done').map((i) => [i.id, i]))
  const merged = next.map((i) => done.get(i.id) ?? i)
  const kept = new Set(merged.map((i) => i.id))
  return [...merged, ...[...done.values()].filter((i) => !kept.has(i.id))]
}
