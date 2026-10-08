/**
 * Watch-term matching. A term (or one of its aliases) matches text
 * case-insensitively on word boundaries: "Jev" matches "Jev 1.13" and
 * "jev-latest", never "Jevons". Spaces, hyphens, dots and underscores
 * inside a term are interchangeable and optional, so "Foo Bar" also matches
 * "Foo-Bar" and "FooBar". Muted terms never match. Pure.
 */

export interface WatchTermLike {
  id: string
  term: string
  aliases: readonly string[]
  muted?: boolean
}

export interface CompiledTerm {
  id: string
  label: string
  re: RegExp
}

const SEPARATORS = /[\s\-_.]+/
const BEFORE = '(?<![\\p{L}\\p{N}])'
const AFTER = '(?![\\p{L}\\p{N}])'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Trimmed, NFKC, single-spaced; '' when too short to match safely. */
export function cleanTerm(raw: string): string {
  const t = raw.normalize('NFKC').replace(/\s+/g, ' ').trim()
  return t.replace(/[\s\-_.]/g, '').length >= 2 ? t : ''
}

/** The regex source for one phrase, or null when it has nothing to match. */
export function phrasePattern(phrase: string): string | null {
  const tokens = cleanTerm(phrase).split(SEPARATORS).filter(Boolean)
  if (tokens.length === 0) return null
  return `${BEFORE}${tokens.map(escapeRegExp).join('[\\s\\-_.]*')}${AFTER}`
}

export function compileTerm(t: WatchTermLike): CompiledTerm | null {
  const patterns = [t.term, ...t.aliases].map(phrasePattern).filter((p): p is string => p !== null)
  if (patterns.length === 0) return null
  // Longest first, so "Foo Bar" wins over "Foo" in highlights.
  patterns.sort((a, b) => b.length - a.length)
  return { id: t.id, label: t.term, re: new RegExp(patterns.map((p) => `(?:${p})`).join('|'), 'giu') }
}

export function compileTerms(terms: readonly WatchTermLike[]): CompiledTerm[] {
  return terms.filter((t) => !t.muted).flatMap((t) => {
    const c = compileTerm(t)
    return c ? [c] : []
  })
}

function hits(re: RegExp, text: string): boolean {
  re.lastIndex = 0
  const ok = re.test(text)
  re.lastIndex = 0
  return ok
}

/** Ids of the terms that match any of the texts, in term order, unique. */
export function matchTerms(texts: ReadonlyArray<string | null | undefined>, compiled: readonly CompiledTerm[]): string[] {
  const joined = texts.filter((t): t is string => !!t).join('\n')
  if (!joined) return []
  return compiled.filter((c) => hits(c.re, joined)).map((c) => c.id)
}

export interface Segment {
  text: string
  /** The matching term's id, or null for plain text. */
  termId: string | null
}

/** Split text into plain and highlighted segments (leftmost, longest match wins). */
export function highlightSegments(text: string, compiled: readonly CompiledTerm[]): Segment[] {
  const ranges: Array<{ start: number; end: number; termId: string }> = []
  for (const c of compiled) {
    c.re.lastIndex = 0
    for (const m of text.matchAll(c.re)) {
      if (m[0].length === 0 || m.index === undefined) continue
      ranges.push({ start: m.index, end: m.index + m[0].length, termId: c.id })
    }
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end)
  const out: Segment[] = []
  let pos = 0
  for (const r of ranges) {
    if (r.start < pos) continue
    if (r.start > pos) out.push({ text: text.slice(pos, r.start), termId: null })
    out.push({ text: text.slice(r.start, r.end), termId: r.termId })
    pos = r.end
  }
  if (pos < text.length) out.push({ text: text.slice(pos), termId: null })
  return out
}
