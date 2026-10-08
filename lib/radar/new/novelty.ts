import type { NewItemInput, NewSource } from './types'

/**
 * The "new" detector and the per-source bounds. Pure.
 *
 * An entity (model id, repo, release version, paper, story, post) is new
 * the FIRST time lee sees it, and only when its own creation date (repo or
 * model creation, release date, submission, post date) is inside the
 * source's window — so an old project that merely trends again is not
 * new. A new release of an old project is a new entity (its key carries
 * the version).
 */

const DAY_MS = 86_400_000

/** How old (by its own creation date) a thing may be and still be "new". */
export const NEW_WINDOW_DAYS: Readonly<Record<NewSource, number>> = {
  hf: 14,
  hf_papers: 14,
  github: 30,
  releases: 30,
  hn: 7,
  feeds: 14,
}

/** At most this many NEW entities per source per UTC day (the shared table stays small). */
export const DAILY_CAP: Readonly<Record<NewSource, number>> = {
  hf: 60,
  hf_papers: 20,
  github: 60,
  releases: 30,
  hn: 30,
  feeds: 30,
}

export function ageDays(created: Date, now: Date): number {
  return Math.max(0, (now.getTime() - created.getTime()) / DAY_MS)
}

/** Reference "very strong" traction per source (per day where it accumulates over time). */
const TRACTION_REF: Readonly<Record<NewSource, number>> = {
  hf: 50,
  hf_papers: 60,
  github: 100,
  releases: 1,
  hn: 300,
  feeds: 1,
}

/** Sources whose metric is a velocity (divided by age); HN points and paper upvotes are already "recent". */
const VELOCITY: ReadonlySet<NewSource> = new Set(['hf', 'github'])

/**
 * 0..1: log-scaled traction. Likes and stars are divided by the age in
 * days (at least one) — early velocity; points and upvotes are used as is.
 * Releases and official posts have no traction metric: 0.5.
 */
export function tractionScore(source: NewSource, metric: number | undefined, created: Date | null, now: Date): number {
  if (source === 'releases' || source === 'feeds') return 0.5
  const m = Math.max(0, metric ?? 0)
  const v = VELOCITY.has(source) && created ? m / Math.max(1, ageDays(created, now)) : m
  return Math.min(1, Math.log10(1 + v) / Math.log10(1 + TRACTION_REF[source]))
}

/** Per-day rate a card shows ("120 likes/day"), or the raw metric. */
export function velocity(metric: number, created: Date | null, now: Date): number {
  return created ? metric / Math.max(1, ageDays(created, now)) : metric
}

export function isNewEntity(input: { known: boolean; createdAt: Date | null; source: NewSource; now: Date }): boolean {
  if (input.known) return false
  if (!input.createdAt) return true
  if (input.createdAt.getTime() > input.now.getTime() + DAY_MS) return false
  return ageDays(input.createdAt, input.now) <= NEW_WINDOW_DAYS[input.source]
}

/**
 * The new items a source may still add today: strongest traction first,
 * up to the daily cap minus what was already added today.
 */
export function capForToday<T extends Pick<NewItemInput, 'traction' | 'entityKey'>>(items: readonly T[], addedToday: number, cap: number): T[] {
  const room = Math.max(0, cap - addedToday)
  return [...items].sort((a, b) => b.traction - a.traction || a.entityKey.localeCompare(b.entityKey)).slice(0, room)
}
