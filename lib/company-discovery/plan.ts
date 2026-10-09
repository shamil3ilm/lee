import { countryOf } from '@/lib/regions/tree'
import type { TargetPlace } from './targets'

/** Pure planning helpers for the weekly run (client-safe). */

/** ISO week number (1–53) of `now`, for rotating GitHub searches. */
function weekNumber(now: Date): number {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

/** This week's slice of a list (rotates so every item comes round). */
export function weeklySlice<T>(items: readonly T[], size: number, now: Date): T[] {
  if (items.length <= size) return [...items]
  const start = (weekNumber(now) * size) % items.length
  return [...items.slice(start), ...items.slice(0, start)].slice(0, size)
}

/** Wikidata place groups: one per country (its cities + the country node). */
export function wikidataGroups(places: readonly TargetPlace[]): TargetPlace[][] {
  const byCountry = new Map<string, TargetPlace[]>()
  for (const p of places) {
    if (p.wikidata.length === 0) continue
    const key = countryOf(p.id) ?? p.id
    byCountry.set(key, [...(byCountry.get(key) ?? []), p])
  }
  return [...byCountry.values()]
}

