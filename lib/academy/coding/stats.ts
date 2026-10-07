import * as codingQ from '@/lib/db/queries/academyCoding'
import { getUserTimeZone } from '@/lib/settings/timezone'
import { addDays, localDay } from '@/lib/academy/day'
import { loadProblemCatalog } from '@/lib/academy/problems/catalog'
import { dailyStreak } from '@/lib/academy/problems/select'
import { summarize, type ProblemSummary } from './list'

/**
 * Profile stats for the coding workbench: solved by difficulty, a
 * submission calendar (from the append-only attempts, so pruning old
 * submission code never empties it) and the language breakdown.
 */

export const HEATMAP_WEEKS = 26

export interface HeatmapDay {
  day: string
  count: number
}

export interface CodingStats {
  summary: ProblemSummary
  heatmap: HeatmapDay[]
  activeDays: number
  languages: Array<{ language: string; count: number }>
  dailyStreak: number
  bestDailyStreak: number
}

/** Every day from the Sunday `weeks` weeks back through today, with counts. Pure. */
export function heatmapDays(today: string, counts: ReadonlyMap<string, number>, weeks = HEATMAP_WEEKS): HeatmapDay[] {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay()
  const start = addDays(today, -(weeks - 1) * 7 - weekday)
  const out: HeatmapDay[] = []
  for (let day = start; day <= today; day = addDays(day, 1)) out.push({ day, count: counts.get(day) ?? 0 })
  return out
}

/** Longest run of consecutive days in a list of YYYY-MM-DD dates. Pure. */
export function longestRun(dates: readonly string[]): number {
  const sorted = [...new Set(dates)].sort()
  let best = 0
  let run = 0
  let prev: string | null = null
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1
    best = Math.max(best, run)
    prev = d
  }
  return best
}

export async function codingStats(userId: string, now: Date = new Date()): Promise<CodingStats> {
  const timeZone = await getUserTimeZone(userId)
  const today = localDay(now, timeZone)
  const since = new Date(now.getTime() - (HEATMAP_WEEKS * 7 + 7) * 86_400_000)
  const [progress, activity, languages, dailyDates] = await Promise.all([
    codingQ.listProgress(userId),
    codingQ.codingActivity(userId, since, timeZone),
    codingQ.languageTotals(userId),
    codingQ.solvedDailyDates(userId),
  ])
  const counts = new Map<string, number>()
  for (const a of activity) counts.set(a.day, (counts.get(a.day) ?? 0) + a.count)
  const heatmap = heatmapDays(today, counts)
  return {
    summary: summarize(loadProblemCatalog().problems, progress),
    heatmap,
    activeDays: heatmap.filter((d) => d.count > 0).length,
    languages: [...languages].sort((a, b) => b.count - a.count),
    dailyStreak: dailyStreak(dailyDates, today),
    bestDailyStreak: longestRun(dailyDates),
  }
}
