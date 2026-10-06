import * as attemptsQ from '@/lib/db/queries/academyAttempts'
import * as stateQ from '@/lib/db/queries/academyState'
import { logger } from '@/lib/logger'
import type { AcademyContent } from '@/lib/academy/content/catalog'
import type { Item } from '@/lib/academy/content/schema'
import { domainsForStage } from '@/lib/academy/selector/interviews'
import { chooseItem } from '@/lib/academy/selector/choose-item'
import { chooseDiagnosticDomains, nextDiagnosticItem } from '@/lib/academy/placement/diagnostic'
import { newSeed } from '@/lib/academy/evaluation/shuffle'
import { ACADEMY_ENGINE_VERSION, contentVersion } from '@/lib/academy/version'
import { AcademyError } from './errors'
import { getTodayPlan, type PlanContext } from './plan'

/**
 * Starting attempts: from a plan item, from a skill page, or the next
 * placement item. An unfinished attempt on the same item started today is
 * resumed instead of duplicated. Returns where to go next.
 */

export type StartResult = { href: string }

const DAY_MS = 86_400_000

interface StartArgs {
  item: Item
  mode: 'practice' | 'plan' | 'diagnostic'
  planDate?: string
  planItemId?: string
}

async function createAttempt(userId: string, content: AcademyContent, now: Date, a: StartArgs): Promise<string> {
  const open = await attemptsQ.openFor(userId, a.item.id, new Date(now.getTime() - DAY_MS))
  if (open && open.mode === a.mode) return open.id
  const row = await attemptsQ.create(userId, {
    itemId: a.item.id,
    skillId: a.item.skillId,
    format: a.item.format,
    mode: a.mode,
    planDate: a.planDate ?? null,
    planItemId: a.planItemId ?? null,
    contentVersion: contentVersion(content),
    engineVersion: ACADEMY_ENGINE_VERSION,
    seed: newSeed(),
    difficulty: a.item.difficulty,
    startedAt: now,
  })
  return row.id
}

const playHref = (id: string): StartResult => ({ href: `/playground/play/${id}` })

/** The next placement item (starting the diagnostic if needed), or the hub when it is finished. */
export async function startPlacement(userId: string, now: Date = new Date(), ctx?: PlanContext): Promise<StartResult> {
  const context = ctx ?? (await getTodayPlan(userId, now)).ctx
  const { content } = context
  let state = context.state
  if (!state.placementStartedAt || state.placementCompletedAt) {
    const domains = chooseDiagnosticDomains(content.graph, {
      skillIds: [...context.placement.seeds.map((s) => s.skillId), ...context.placement.studyTargets.map((t) => t.skillId)],
      interviewDomains: context.interviews.flatMap((i) => domainsForStage(i.kind)),
    })
    await stateQ.update(userId, { placementStartedAt: now, placementCompletedAt: null, placementDomains: domains })
    state = { ...state, placementStartedAt: now, placementCompletedAt: null, placementDomains: domains }
  }
  const done = await attemptsQ.diagnosticSince(userId, state.placementStartedAt ?? now)
  const step = nextDiagnosticItem(content, state.placementDomains, context.inputs.ratings, done)
  if (!step) {
    await stateQ.update(userId, { placementCompletedAt: now })
    logger.info('academy_placement_completed', { items: done.length })
    return { href: '/playground' }
  }
  return playHref(await createAttempt(userId, content, now, { item: step.item, mode: 'diagnostic' }))
}

/** Start the plan item `planItemId` of today's plan. */
export async function startPlanItem(userId: string, planItemId: string, now: Date = new Date()): Promise<StartResult> {
  const { ctx, items } = await getTodayPlan(userId, now)
  const planItem = items.find((i) => i.id === planItemId)
  if (!planItem) throw new AcademyError('not_found', 'That plan item is no longer in today’s plan. Refresh to see the latest plan.')
  if (planItem.kind === 'placement') return startPlacement(userId, now, ctx)
  if (planItem.kind === 'review') return { href: '/playground/review' }
  const item = planItem.itemId ? ctx.content.itemById.get(planItem.itemId) : undefined
  if (!item) throw new AcademyError('retired', 'That exercise is no longer available. Refresh the plan.')
  const id = await createAttempt(userId, ctx.content, now, { item, mode: 'plan', planDate: ctx.today, planItemId: planItem.id })
  return playHref(id)
}

/** Practise one skill now (skill page): the item nearest ~70% success. */
export async function startSkillPractice(userId: string, skillId: string, now: Date = new Date()): Promise<StartResult> {
  const { ctx } = await getTodayPlan(userId, now)
  if (!ctx.content.graph.byId.has(skillId)) throw new AcademyError('not_found', 'Unknown skill.')
  const rating = ctx.inputs.ratings.get(skillId)?.rating ?? 1400
  const item = chooseItem(ctx.content, skillId, rating, ctx.inputs.recentItemIds)
  if (!item) throw new AcademyError('no_item', 'There are no built-in exercises for this skill yet.')
  return playHref(await createAttempt(userId, ctx.content, now, { item, mode: 'practice' }))
}
