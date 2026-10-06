import { db } from '@/lib/db/client'
import * as attemptsQ from '@/lib/db/queries/academyAttempts'
import * as journeyQ from '@/lib/db/queries/academyJourney'
import * as ratingsQ from '@/lib/db/queries/academyRatings'
import * as reviewsQ from '@/lib/db/queries/academyReviews'
import * as stateQ from '@/lib/db/queries/academyState'
import type { SkillRatingRow } from '@/lib/db/queries/academyRatings'
import type { UserStateRow } from '@/lib/db/queries/academyState'
import { logger } from '@/lib/logger'
import { getUserTimeZone } from '@/lib/settings/timezone'
import { loadAcademyContent, type AcademyContent } from '@/lib/academy/content/catalog'
import { localDay } from '@/lib/academy/day'
import { DIAGNOSTIC_PER_DOMAIN, MAX_DIAGNOSTIC_DOMAINS, diagnosticRemaining } from '@/lib/academy/placement/diagnostic'
import type { Placement } from '@/lib/academy/placement/seed'
import { buildPlan, mergePlans, planSignature } from '@/lib/academy/selector/plan'
import { readPlanItems } from '@/lib/academy/selector/plan-store'
import { INTERVIEW_WINDOW_DAYS } from '@/lib/academy/selector/interviews'
import { PLAN_MODES, type PlanInputs, type PlanItem, type PlanMode, type UpcomingInterview } from '@/lib/academy/selector/types'
import { capJson, PLAN_MAX_BYTES } from './caps'
import { syncPlacement } from './placement'
import { toSkillStates } from './skill-states'

/**
 * Today's plan for a user: gathers the selector inputs (ratings, due cards,
 * interviews within 7 days, the study list, placement progress, budget and
 * mode), regenerates when they changed, and stores it per local day.
 */

const DAY_MS = 86_400_000

export interface PlanContext {
  content: AcademyContent
  now: Date
  timeZone: string
  today: string
  state: UserStateRow
  ratingRows: SkillRatingRow[]
  placement: Placement
  interviews: UpcomingInterview[]
  dueReviews: number
  inputs: PlanInputs
}

export function toMode(value: string): PlanMode {
  return (PLAN_MODES as readonly string[]).includes(value) ? (value as PlanMode) : 'balanced'
}

async function placementProgress(
  userId: string,
  state: UserStateRow,
  content: AcademyContent,
): Promise<{ done: boolean; remaining: number }> {
  if (state.placementCompletedAt) return { done: true, remaining: 0 }
  if (!state.placementStartedAt) return { done: false, remaining: DIAGNOSTIC_PER_DOMAIN * MAX_DIAGNOSTIC_DOMAINS }
  const done = await attemptsQ.diagnosticSince(userId, state.placementStartedAt)
  return { done: false, remaining: diagnosticRemaining(content, state.placementDomains, done) }
}

export async function loadPlanContext(userId: string, now: Date = new Date()): Promise<PlanContext> {
  const content = loadAcademyContent()
  const placement = await syncPlacement(userId, content)
  const [timeZone, state, ratingRows, dueReviews, interviews, recentItemIds] = await Promise.all([
    getUserTimeZone(userId),
    stateQ.ensure(userId),
    ratingsQ.list(userId),
    reviewsQ.dueCount(userId, now),
    journeyQ.upcomingInterviews(userId, now, new Date(now.getTime() + (INTERVIEW_WINDOW_DAYS + 1) * DAY_MS)),
    attemptsQ.recentItemIds(userId),
  ])
  const today = localDay(now, timeZone)
  const inputs: PlanInputs = {
    content,
    now,
    today,
    timeZone,
    timeBudgetMin: state.timeBudgetMin,
    mode: toMode(state.mode),
    ratings: toSkillStates(ratingRows, now),
    dueReviews,
    interviews,
    studyTargets: placement.studyTargets,
    recentItemIds,
    placement: await placementProgress(userId, state, content),
  }
  return { content, now, timeZone, today, state, ratingRows, placement, interviews, dueReviews, inputs }
}

/** The stored plan for today, regenerated (keeping finished items) when its inputs changed. */
export async function ensureTodayPlan(userId: string, ctx: PlanContext): Promise<PlanItem[]> {
  const signature = planSignature(ctx.inputs)
  const row = await stateQ.getPlan(userId, ctx.today)
  if (row && row.signature === signature) return readPlanItems(row.items)
  const fresh = buildPlan(ctx.inputs)
  const items = row ? mergePlans(readPlanItems(row.items), fresh.items) : fresh.items
  const stored = capJson(items, PLAN_MAX_BYTES, items.slice(0, 4))
  const reason = row ? 'regenerated' : 'generated'
  await stateQ.savePlan(userId, ctx.today, { items: stored, signature, reason }, db)
  logger.info('academy_plan_generated', { reason, items: stored.length, minutes: fresh.totalMinutes })
  return stored
}

export async function getTodayPlan(userId: string, now: Date = new Date()): Promise<{ ctx: PlanContext; items: PlanItem[] }> {
  const ctx = await loadPlanContext(userId, now)
  return { ctx, items: await ensureTodayPlan(userId, ctx) }
}
