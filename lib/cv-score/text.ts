/**
 * v12.0 — small, pure text helpers shared by the extractor and dimensions.
 */

export const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with',
  'at', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'it', 'its', 'this', 'that', 'these', 'those', 'into', 'over', 'across', 'per',
  'via', 'our', 'your', 'you', 'we', 'they', 'their', 'will', 'can', 'using',
  'use', 'used', 'within', 'about', 'than', 'then', 'also', 'such', 'other',
  'more', 'most', 'both', 'each', 'all', 'any', 'new', 'work', 'working',
  'experience', 'strong', 'ability', 'able', 'including', 'etc', 'plus', 'have',
  'has', 'had', 'team', 'teams', 'years', 'year', 'role', 'building', 'build',
])

/** Collapse whitespace and lowercase — for case/space-insensitive compare. */
export function looseNormalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

export function words(s: string): string[] {
  return s.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w))
}

export function wordCount(s: string): number {
  return words(s).length
}

/** Crude stemmer: enough to make "migrated"/"migration"/"migrating" collide. */
export function stem(w: string): string {
  let x = w.toLowerCase().replace(/[^a-z0-9+#]/g, '')
  if (x.length > 5) x = x.replace(/(ations?|ings?|ments?|ers?|ed|es|ly)$/, '')
  else if (x.length > 3) x = x.replace(/s$/, '')
  return x
}

/** Content-word stems (stopwords and very short tokens removed). */
export function contentStems(s: string): Set<string> {
  const out = new Set<string>()
  for (const raw of s.toLowerCase().split(/[^a-z0-9+#.]+/)) {
    const w = raw.replace(/\.$/, '')
    if (w.length < 3 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue
    out.add(stem(w))
  }
  return out
}

export function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n))
}

export function round(n: number): number {
  return Math.round(n)
}

/** Truncate an excerpt for finding locations. */
export function excerpt(s: string, max = 120): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

/** Stable short hash (FNV-1a, 32-bit, hex) — for deterministic finding ids. */
export function shortHash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** All digit runs in a string ("$200M in 3 weeks" → ["200", "3"]). */
export function digitRuns(s: string): string[] {
  return s.match(/\d+(?:[.,]\d+)?/g) ?? []
}

/** Months between two YYYY-MM strings (b - a). */
export function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by! - ay!) * 12 + ((bm ?? 1) - (am ?? 1))
}

export function toYearMonth(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
