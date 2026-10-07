import type { DbClient } from '@/lib/db/client'
import * as attemptsQ from '@/lib/db/queries/academyAttempts'
import * as codingQ from '@/lib/db/queries/academyCoding'
import * as ratingsQ from '@/lib/db/queries/academyRatings'
import * as stateQ from '@/lib/db/queries/academyState'
import type { AcademyContent } from '@/lib/academy/content/catalog'
import type { Rank } from '@/lib/academy/content/schema'
import { highScoreThresholds, newlyEarned } from '@/lib/academy/gamification/achievements'
import { rankFor } from '@/lib/academy/gamification/rank'
import { nextStreak } from '@/lib/academy/gamification/streak'

/**
 * XP, streak, rank and achievements after an attempt or a review, inside the
 * caller's transaction so a result is counted exactly once.
 */

export interface ProgressInput extends ProgressExtra {
  today: string
  xpGain: number
  reviewsGain: number
  attemptId: string | null
}

/** Coding-workbench facts for the coding achievements (phase 13.1). */
export interface ProgressExtra {
  dailyStreak?: number
}

export interface ProgressResult {
  xp: number
  rank: Rank
  rankChanged: boolean
  streakDays: number
  earned: Array<{ id: string; name: string }>
}

export async function applyProgress(
  userId: string,
  content: AcademyContent,
  input: ProgressInput,
  tx: DbClient,
): Promise<ProgressResult> {
  const state = await stateQ.ensure(userId, tx)
  const streak = nextStreak({ streakDays: state.streakDays, lastActiveDate: state.lastActiveDate }, input.today)
  const levels = (await ratingsQ.list(userId, tx)).map((r) => r.level)
  const rank = rankFor(levels)
  const xp = state.xp + input.xpGain
  const reviewsDone = state.reviewsDone + input.reviewsGain
  const bestStreak = Math.max(state.bestStreak, streak.streakDays)
  await stateQ.update(
    userId,
    { xp, rank, streakDays: streak.streakDays, bestStreak, lastActiveDate: streak.lastActiveDate, reviewsDone },
    tx,
  )
  const counts = await attemptsQ.counts(userId, tx)
  const thresholds = new Map<number, number>()
  for (const t of highScoreThresholds(content.achievements)) thresholds.set(t, await attemptsQ.countAtLeast(userId, t, tx))
  const domains = new Set(counts.skills.map((id) => content.graph.byId.get(id)?.domain).filter(Boolean))
  const already = new Set((await stateQ.listAchievements(userId, tx)).map((a) => a.achievementId))
  const ids = newlyEarned(
    content.achievements,
    {
      attempts: counts.attempts,
      highScores: (min) => thresholds.get(min) ?? 0,
      placementDone: state.placementCompletedAt !== null,
      bestStreak,
      levels,
      domainsPracticed: domains.size,
      reviews: reviewsDone,
      rank,
      problemsSolved: await codingQ.solvedCount(userId, tx),
      dailyStreak: input.dailyStreak ?? 0,
    },
    already,
  )
  await stateQ.addAchievements(userId, ids, input.attemptId, tx)
  const names = new Map(content.achievements.map((a) => [a.id, a.name]))
  return {
    xp,
    rank,
    rankChanged: rank !== state.rank,
    streakDays: streak.streakDays,
    earned: ids.map((id) => ({ id, name: names.get(id) ?? id })),
  }
}
