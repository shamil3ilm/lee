import { normalizeForMatch } from './text'

/**
 * Titles lee learned from the user: "Show anyway" on a filtered posting, or
 * saving / applying to an uncertain one, marks its normalised title as
 * related (with the family lee inferred); "Not for me → not my field" marks
 * it unrelated. Stored as `user_profile.learned_titles` jsonb and editable
 * in Settings › Search preferences.
 */

export interface LearnedTitle {
  related: boolean
  /** Role family the title counts as (related titles), or null. */
  family: string | null
  /** When it was learned (ISO date). */
  at: string
}

export type LearnedTitles = Readonly<Record<string, LearnedTitle>>

export const MAX_LEARNED = 300

const SENIORITY_WORDS = /\b(?:senior|sr|junior|jr|lead|principal|staff|mid(?:-level)?|associate|intern|trainee|head of|i{1,3}|iv|[1-4])\b/g

/**
 * The title without seniority, place and noise, so "Senior Integration
 * Analyst - Riyadh (Hybrid)" and "Integration Analyst" share one entry.
 */
export function normalizeTitle(title: string): string {
  const head = title.split(/\s[-–|@]\s|[([]/)[0] ?? title
  return normalizeForMatch(head)
    .replace(/[^\p{L}\p{N}\s/&+#.]/gu, ' ')
    .replace(SENIORITY_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

export function parseLearnedTitles(value: unknown): Record<string, LearnedTitle> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, LearnedTitle> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!k || k.length > 80 || !v || typeof v !== 'object') continue
    const e = v as Record<string, unknown>
    if (typeof e.related !== 'boolean') continue
    out[k] = {
      related: e.related,
      family: typeof e.family === 'string' ? e.family : null,
      at: typeof e.at === 'string' ? e.at : '',
    }
  }
  return out
}

/** A copy with one title learned (never mutates); the oldest entries drop past MAX_LEARNED. */
export function learnTitle(
  current: LearnedTitles,
  title: string,
  entry: { related: boolean; family: string | null },
  now: Date = new Date(),
): Record<string, LearnedTitle> {
  const key = normalizeTitle(title)
  if (!key) return { ...current }
  const next: Record<string, LearnedTitle> = { ...current, [key]: { ...entry, at: now.toISOString().slice(0, 10) } }
  const keys = Object.keys(next)
  if (keys.length <= MAX_LEARNED) return next
  const oldest = keys.sort((a, b) => (next[a]!.at < next[b]!.at ? -1 : 1)).slice(0, keys.length - MAX_LEARNED)
  for (const k of oldest) delete next[k]
  return next
}

export function learnedFor(learned: LearnedTitles, title: string): LearnedTitle | null {
  return learned[normalizeTitle(title)] ?? null
}
