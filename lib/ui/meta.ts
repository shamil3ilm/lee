/**
 * Meta lines ("Juspay · Bengaluru, IN · 2d ago") are built from the parts
 * that are actually present, so a missing company or a placeholder never
 * leaves a stray leading "·" or a "— ·" behind.
 */

/** Values that mean "nothing here" and must not render as a part. */
const PLACEHOLDERS = new Set(['—', '–', '-', '·', 'n/a', 'na', 'none', 'unknown', 'null', 'undefined'])

/** Present, trimmed, de-duplicated parts in their original order. */
export function metaParts(parts: ReadonlyArray<string | null | undefined | false>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    if (typeof p !== 'string') continue
    const v = p.trim()
    if (!v || PLACEHOLDERS.has(v.toLowerCase()) || seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

/** The present parts joined with " · "; empty string when none are left. */
export function joinMeta(parts: ReadonlyArray<string | null | undefined | false>, sep = ' · '): string {
  return metaParts(parts).join(sep)
}
