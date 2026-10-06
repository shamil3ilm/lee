import type { Achievement, AchievementRule, Rank } from '@/lib/academy/content/schema'
import { rankIndex } from './rank'

/** Achievement rules from the content catalog, checked against stats. Pure. */

export interface AchievementStats {
  attempts: number
  /** Attempts with composite ≥ min. */
  highScores: (minComposite: number) => number
  placementDone: boolean
  bestStreak: number
  levels: readonly number[]
  domainsPracticed: number
  reviews: number
  rank: Rank
}

export function ruleMet(rule: AchievementRule, s: AchievementStats): boolean {
  switch (rule.type) {
    case 'attempts':
      return s.attempts >= rule.count
    case 'high_scores':
      return s.highScores(rule.minComposite) >= rule.count
    case 'placement_done':
      return s.placementDone
    case 'streak':
      return s.bestStreak >= rule.days
    case 'skill_level':
      return s.levels.filter((l) => l >= rule.level).length >= rule.count
    case 'domains':
      return s.domainsPracticed >= rule.count
    case 'reviews':
      return s.reviews >= rule.count
    case 'rank':
      return rankIndex(s.rank) >= rankIndex(rule.rank)
  }
}

/** Ids of achievements met now and not yet earned, in catalog order. */
export function newlyEarned(catalog: readonly Achievement[], stats: AchievementStats, earned: ReadonlySet<string>): string[] {
  return catalog.filter((a) => !earned.has(a.id) && ruleMet(a.rule, stats)).map((a) => a.id)
}

/** Distinct composite thresholds the catalog asks about (to count once each). */
export function highScoreThresholds(catalog: readonly Achievement[]): number[] {
  const out = new Set<number>()
  for (const a of catalog) if (a.rule.type === 'high_scores') out.add(a.rule.minComposite)
  return [...out]
}
