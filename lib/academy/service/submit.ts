import { db, type DbClient } from '@/lib/db/client'
import * as attemptsQ from '@/lib/db/queries/academyAttempts'
import * as ratingsQ from '@/lib/db/queries/academyRatings'
import * as reviewsQ from '@/lib/db/queries/academyReviews'
import * as stateQ from '@/lib/db/queries/academyState'
import type { AttemptRow } from '@/lib/db/queries/academyAttempts'
import { logger } from '@/lib/logger'
import { getUserTimeZone } from '@/lib/settings/timezone'
import { loadAcademyContent, type AcademyContent } from '@/lib/academy/content/catalog'
import type { Item } from '@/lib/academy/content/schema'
import { localDay } from '@/lib/academy/day'
import { evaluateAttempt } from '@/lib/academy/evaluation/registry'
import { readEvaluation, type AttemptEvaluation } from '@/lib/academy/evaluation/types'
import { xpForAttempt } from '@/lib/academy/gamification/xp'
import { levelForRating, type Level } from '@/lib/academy/levels'
import { DEFAULT_DEVIATION, DEFAULT_RATING, ratingAsOf, updateRating } from '@/lib/academy/rating'
import { diagnosticRemaining } from '@/lib/academy/placement/diagnostic'
import { markDone, readPlanItems } from '@/lib/academy/selector/plan-store'
import { nextDue } from '@/lib/academy/srs/sm2'
import { capJson, EVALUATION_MAX_BYTES, SUBMISSION_MAX_BYTES } from './caps'
import { AcademyError } from './errors'
import { applyProgress } from './progress'

/**
 * Submitting an attempt: score it (multi-axis), move the skill rating
 * (Glicko), snapshot the rating, enrol the skill's concept cards for review,
 * tick the plan item, then XP / streak / rank / achievements — all in one
 * transaction, and exactly once per attempt.
 */

export interface SubmitResult {
  attemptId: string
  skillId: string
  evaluation: AttemptEvaluation
  xp: number
  levelBefore: Level
  levelAfter: Level
  earned: Array<{ id: string; name: string }>
  /** 'placement' when more placement items are waiting. */
  next: 'placement' | null
  alreadySubmitted: boolean
}

const MAX_ELAPSED_SEC = 3600

function elapsedSince(startedAt: Date, now: Date): number {
  return Math.min(MAX_ELAPSED_SEC, Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 1000)))
}

function priorResult(row: AttemptRow): SubmitResult {
  const evaluation = readEvaluation(row.evaluation)
  if (!evaluation) throw new AcademyError('invalid', 'This attempt was already submitted.')
  const before = levelForRating(row.ratingBefore ?? DEFAULT_RATING)
  return {
    attemptId: row.id,
    skillId: row.skillId,
    evaluation,
    xp: row.xpAwarded,
    levelBefore: before,
    levelAfter: levelForRating(row.ratingAfter ?? DEFAULT_RATING),
    earned: [],
    next: null,
    alreadySubmitted: true,
  }
}

async function tickPlan(userId: string, row: AttemptRow, tx: DbClient): Promise<void> {
  if (!row.planDate || !row.planItemId) return
  const plan = await stateQ.getPlan(userId, row.planDate, tx)
  if (!plan) return
  await stateQ.setPlanItems(userId, row.planDate, markDone(readPlanItems(plan.items), row.planItemId, row.id), tx)
}

/** Diagnostic bookkeeping: true when placement items remain. */
async function advancePlacement(userId: string, content: AcademyContent, now: Date, tx: DbClient): Promise<boolean> {
  const state = await stateQ.ensure(userId, tx)
  if (!state.placementStartedAt || state.placementCompletedAt) return false
  const done = await attemptsQ.diagnosticSince(userId, state.placementStartedAt, tx)
  const remaining = diagnosticRemaining(content, state.placementDomains, done)
  if (remaining > 0) return true
  await stateQ.update(userId, { placementCompletedAt: now }, tx)
  logger.info('academy_placement_completed', { items: done.length })
  return false
}

interface Scored {
  row: AttemptRow
  item: Item
  evaluation: AttemptEvaluation
  submission: unknown
  elapsedSec: number
}

async function record(userId: string, content: AcademyContent, s: Scored, now: Date, today: string): Promise<SubmitResult | null> {
  return db.transaction(async (tx) => {
    const stored = await ratingsQ.get(userId, s.row.skillId, tx)
    const current = stored
      ? ratingAsOf({ rating: stored.rating, deviation: stored.deviation, lastPracticedAt: stored.lastPracticedAt }, now)
      : { rating: DEFAULT_RATING, deviation: DEFAULT_DEVIATION }
    const next = updateRating(current, { difficulty: s.item.difficulty, outcome: s.evaluation.outcome })
    const levelBefore: Level = stored && stored.level > 0 ? levelForRating(current.rating) : 0
    const levelAfter = levelForRating(next.rating)
    const xp = xpForAttempt({ difficulty: s.item.difficulty, composite: s.evaluation.composite })
    const evaluation = capJson(s.evaluation, EVALUATION_MAX_BYTES, { ...s.evaluation, improvements: [] })
    const updated = await attemptsQ.submit(
      userId,
      s.row.id,
      {
        submittedAt: now,
        elapsedSec: s.elapsedSec,
        submission: capJson(s.submission, SUBMISSION_MAX_BYTES, { truncated: true }),
        evaluation,
        composite: s.evaluation.composite,
        xpAwarded: xp,
        ratingBefore: current.rating,
        ratingAfter: next.rating,
      },
      tx,
    )
    if (!updated) return null
    await ratingsQ.upsert(
      userId,
      {
        skillId: s.row.skillId,
        rating: next.rating,
        deviation: next.deviation,
        level: levelAfter,
        attempts: (stored?.attempts ?? 0) + 1,
        lastPracticedAt: now,
        seed: stored?.seed ?? null,
      },
      tx,
    )
    const kind = s.row.mode === 'diagnostic' ? 'diagnostic' : 'attempt'
    await ratingsQ.addHistory(userId, [{ skillId: s.row.skillId, attemptId: s.row.id, kind, ...next, level: levelAfter }], tx)
    const dueAt = s.evaluation.outcome >= 1 ? nextDue(now, 1) : now
    const cards = content.cardsBySkill.get(s.row.skillId) ?? []
    await reviewsQ.enroll(userId, cards.map((c) => ({ cardId: c.id, skillId: c.skillId, dueAt })), tx)
    await tickPlan(userId, s.row, tx)
    const morePlacement = s.row.mode === 'diagnostic' ? await advancePlacement(userId, content, now, tx) : false
    const progress = await applyProgress(userId, content, { today, xpGain: xp, reviewsGain: 0, attemptId: s.row.id }, tx)
    return {
      attemptId: s.row.id,
      skillId: s.row.skillId,
      evaluation,
      xp,
      levelBefore,
      levelAfter,
      earned: progress.earned,
      next: morePlacement ? ('placement' as const) : null,
      alreadySubmitted: false,
    }
  })
}

function logResult(r: SubmitResult, row: AttemptRow): void {
  logger.info('academy_attempt_submitted', {
    skillId: r.skillId,
    format: row.format,
    mode: row.mode,
    composite: r.evaluation.composite,
    xp: r.xp,
  })
  if (r.levelAfter > r.levelBefore) logger.info('academy_level_up', { skillId: r.skillId, level: r.levelAfter })
  for (const a of r.earned) logger.info('academy_achievement_earned', { achievementId: a.id })
}

export async function submitAttempt(userId: string, attemptId: string, raw: unknown, now: Date = new Date()): Promise<SubmitResult> {
  const content = loadAcademyContent()
  const row = await attemptsQ.get(userId, attemptId)
  if (!row) throw new AcademyError('not_found', 'That attempt was not found.')
  if (row.submittedAt) return priorResult(row)
  const item = content.itemById.get(row.itemId)
  if (!item) throw new AcademyError('retired', 'This exercise is no longer in the Playground.')
  const elapsedSec = elapsedSince(row.startedAt, now)
  const evaluation = evaluateAttempt(item, raw, { elapsedSec, hintsUsed: 0 })
  const submission = { choice: (raw as { choice: number }).choice }
  const today = localDay(now, await getUserTimeZone(userId))
  const result = await record(userId, content, { row, item, evaluation, submission, elapsedSec }, now, today)
  if (!result) {
    const again = await attemptsQ.get(userId, attemptId)
    if (!again) throw new AcademyError('not_found', 'That attempt was not found.')
    return priorResult(again)
  }
  logResult(result, row)
  return result
}
