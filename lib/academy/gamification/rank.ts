import type { Rank } from '@/lib/academy/content/schema'

/**
 * Engineer rank (v13 §7): Intern → Principal, derived from how many skills
 * sit at which level, so it can't be ground out by volume. Pure.
 */

export const RANK_LABELS: Readonly<Record<Rank, string>> = {
  intern: 'Intern',
  junior: 'Junior',
  mid: 'Mid',
  senior: 'Senior',
  staff: 'Staff',
  principal: 'Principal',
}

export const RANK_ORDER: readonly Rank[] = ['intern', 'junior', 'mid', 'senior', 'staff', 'principal']

/** Highest rank first: [rank, needs] where needs = [minLevel, count] pairs. */
const RULES: ReadonlyArray<readonly [Rank, ReadonlyArray<readonly [number, number]>]> = [
  ['principal', [[4, 12], [5, 4]]],
  ['staff', [[4, 10]]],
  ['senior', [[3, 8], [4, 3]]],
  ['mid', [[3, 6]]],
  ['junior', [[2, 3]]],
]

export function rankFor(levels: readonly number[]): Rank {
  const atLeast = (min: number): number => levels.filter((l) => l >= min).length
  for (const [rank, needs] of RULES) {
    if (needs.every(([min, count]) => atLeast(min) >= count)) return rank
  }
  return 'intern'
}

export function rankIndex(rank: string): number {
  const i = RANK_ORDER.indexOf(rank as Rank)
  return i < 0 ? 0 : i
}

/** What the next rank needs, as a short sentence (null at the top). */
export function nextRankHint(rank: Rank): string | null {
  switch (rank) {
    case 'intern':
      return 'Junior: 3 skills at Beginner or above.'
    case 'junior':
      return 'Mid: 6 skills at Competent or above.'
    case 'mid':
      return 'Senior: 8 skills at Competent, 3 of them Proficient.'
    case 'senior':
      return 'Staff: 10 skills at Proficient.'
    case 'staff':
      return 'Principal: 12 skills at Proficient, 4 of them Expert.'
    default:
      return null
  }
}
