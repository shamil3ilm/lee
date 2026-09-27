/**
 * Text helpers for the relevance gate. Pure and client-safe (no Node APIs).
 *
 * Job boards hand us inconsistent text: RemoteOK, for one, serves non-ASCII
 * locations double-encoded ("Ø¯Ø¨Ù" for "دبي", Dubai). Every matcher runs
 * on `normalizeForMatch` output so a spelling or encoding quirk never hides
 * a Gulf or Indian location from the gate.
 */

/** Windows-1252 code points 0x80–0x9F that differ from Latin-1. */
const CP1252_REVERSE: Readonly<Record<string, number>> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85,
  '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a,
  '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92,
  '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c,
  'ž': 0x9e, 'Ÿ': 0x9f,
}

/** A UTF-8 lead byte (as a Latin-1 char) followed by a continuation byte. */
const MOJIBAKE_HINT = /[Â-ô][\u0080-¿–-›€Œ-ƒˆ˜™]/

/**
 * Undo UTF-8 → Latin-1/CP1252 → UTF-8 double encoding. Returns the input
 * unchanged unless the whole string re-decodes as valid UTF-8.
 */
export function repairMojibake(input: string): string {
  if (!MOJIBAKE_HINT.test(input)) return input
  const bytes: number[] = []
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0
    if (code <= 0xff) bytes.push(code)
    else if (CP1252_REVERSE[ch] !== undefined) bytes.push(CP1252_REVERSE[ch])
    else return input
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes))
  } catch {
    return input
  }
}

/**
 * Lowercase, accent-free, encoding-repaired text with Arabic letter variants
 * folded (أ/إ/آ → ا, ى → ي, ة → ه) and diacritics removed, so aliases can be
 * written once.
 */
export function normalizeForMatch(input: string | null | undefined): string {
  if (!input) return ''
  return repairMojibake(input)
    .normalize('NFKD')
    .replace(/[̀-ًͯ-ٰٟ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[‐-―]/g, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Regex source for one alias: spaces, hyphens and dots between words are
 * interchangeable ("full stack" = "full-stack" = "fullstack").
 */
function termSource(term: string): string {
  const t = normalizeForMatch(term)
  return t
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(escapeRegex)
    .join('[\\s\\-_./]*')
}

/** Letters and digits in any script bound a match (Unicode-aware \b). */
const LEFT = '(?<![\\p{L}\\p{N}])'
const RIGHT = '(?![\\p{L}\\p{N}])'

/** A compiled any-of matcher over normalized text; returns the hit or null. */
export interface TermMatcher {
  (normalizedText: string): string | null
}

export function termMatcher(terms: readonly string[]): TermMatcher {
  const sources = terms.map(termSource).filter((s) => s.length > 0)
  if (sources.length === 0) return () => null
  // Longest first so "abu dhabi" wins over "abu".
  sources.sort((a, b) => b.length - a.length)
  const re = new RegExp(`${LEFT}(?:${sources.join('|')})${RIGHT}`, 'u')
  return (text) => {
    const m = re.exec(text)
    return m ? m[0] : null
  }
}

const single = new Map<string, TermMatcher>()

function singleMatcher(term: string): TermMatcher {
  let m = single.get(term)
  if (!m) {
    m = termMatcher([term])
    if (single.size > 5_000) single.clear()
    single.set(term, m)
  }
  return m
}

/** Every term of `terms` found in `text` (text already normalized). */
export function findTerms(text: string, terms: readonly string[]): string[] {
  return terms.filter((term) => singleMatcher(term)(text) !== null)
}
