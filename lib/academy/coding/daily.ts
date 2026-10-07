import * as attemptsQ from '@/lib/db/queries/academyAttempts'
import * as codingQ from '@/lib/db/queries/academyCoding'
import * as ratingsQ from '@/lib/db/queries/academyRatings'
import { getUserTimeZone } from '@/lib/settings/timezone'
import { localDay } from '@/lib/academy/day'
import { loadProblemCatalog } from '@/lib/academy/problems/catalog'
import type { Problem } from '@/lib/academy/problems/schema'
import { dailyStreak, pickProblem, seedOf, type PickInputs } from '@/lib/academy/problems/select'
import { ratingAsOf } from '@/lib/academy/rating'

/**
 * Inputs for the adaptive problem picker, and the daily problem: one per
 * local day, chosen once by the picker and then fixed for the day (so a
 * rating change after a submit does not swap it). The daily streak counts
 * consecutive days with the daily problem solved.
 */

export interface PickerContext {
  today: string
  ratings: Map<string, number>
  solved: Set<string>
  recent: string[]
}

export async function pickerContext(userId: string, now: Date = new Date()): Promise<PickerContext> {
  const [timeZone, ratingRows, progress, recent] = await Promise.all([
    getUserTimeZone(userId),
    ratingsQ.list(userId),
    codingQ.listProgress(userId),
    attemptsQ.recentItemIds(userId, 40),
  ])
  const ratings = new Map(
    ratingRows.map((r) => [r.skillId, ratingAsOf({ rating: r.rating, deviation: r.deviation, lastPracticedAt: r.lastPracticedAt }, now).rating]),
  )
  return {
    today: localDay(now, timeZone),
    ratings,
    solved: new Set(progress.filter((p) => p.status === 'solved').map((p) => p.problemSlug)),
    recent,
  }
}

export function pickFor(ctx: PickerContext, extra: Partial<PickInputs> & { seed: number }): Problem | null {
  return pickProblem(loadProblemCatalog().problems, { ratings: ctx.ratings, solved: ctx.solved, recent: ctx.recent, ...extra })
}

export interface DailyProblem {
  date: string
  slug: string
  title: string
  difficulty: Problem['difficulty']
  skillId: string
  /** Plan minutes: the problem's par time. */
  minutes: number
  solved: boolean
  streak: number
}

export async function dailyProblem(userId: string, now: Date = new Date(), ctx?: PickerContext): Promise<DailyProblem | null> {
  const context = ctx ?? (await pickerContext(userId, now))
  const catalog = loadProblemCatalog()
  let row = await codingQ.getDaily(userId, context.today)
  if (!row || !catalog.bySlug.has(row.problemSlug)) {
    const pick = pickFor(context, { seed: seedOf(`${context.today}:${userId}`), spread: 3 })
    if (!pick) return null
    row = await codingQ.ensureDaily(userId, context.today, pick.slug)
  }
  const problem = catalog.bySlug.get(row.problemSlug)
  if (!problem) return null
  const dates = await codingQ.solvedDailyDates(userId)
  return {
    date: row.date,
    slug: problem.slug,
    title: problem.title,
    difficulty: problem.difficulty,
    skillId: problem.skillId,
    minutes: Math.ceil(problem.parSec / 60),
    solved: row.solvedAt !== null,
    streak: dailyStreak(dates, context.today),
  }
}
