import type { SkillRatingRow } from '@/lib/db/queries/academyRatings'
import { isLevel, type Level } from '@/lib/academy/levels'
import { ratingAsOf } from '@/lib/academy/rating'
import type { SkillState } from '@/lib/academy/selector/types'

/** Stored rating rows → selector skill states (deviation decayed to `now`). Pure. */

export function toSkillState(row: SkillRatingRow, now: Date): SkillState {
  const r = ratingAsOf({ rating: row.rating, deviation: row.deviation, lastPracticedAt: row.lastPracticedAt }, now)
  const level: Level = isLevel(row.level) ? row.level : 0
  return { skillId: row.skillId, rating: r.rating, deviation: r.deviation, level, attempts: row.attempts, lastPracticedAt: row.lastPracticedAt }
}

export function toSkillStates(rows: readonly SkillRatingRow[], now: Date): Map<string, SkillState> {
  return new Map(rows.map((r) => [r.skillId, toSkillState(r, now)]))
}

export function levelMap(rows: readonly SkillRatingRow[]): Map<string, number> {
  return new Map(rows.map((r) => [r.skillId, r.level]))
}

export interface SeedInfo {
  explanation: string
  sources: Array<{ label: string; note: string }>
}

/** Lenient read of a stored placement explanation. */
export function readSeed(value: unknown): SeedInfo | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Partial<SeedInfo>
  if (typeof v.explanation !== 'string') return null
  const sources = Array.isArray(v.sources)
    ? v.sources.filter((s): s is { label: string; note: string } => typeof s?.label === 'string' && typeof s?.note === 'string')
    : []
  return { explanation: v.explanation, sources }
}
