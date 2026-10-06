/**
 * The fact lock. A wording of a master highlight may change words, never
 * facts: every number in the wording must also appear in the master text.
 * Pure and client-safe, so the editor can flag a wording as you type and
 * the server enforces the same rule on save.
 *
 * Numbers are compared as normalized tokens: thousands separators dropped
 * ("1,200" = "1200"), magnitude suffixes kept ("2M" ≠ "2"), spelled-out
 * numbers read as digits ("three" = "3"). Conservative by design: a
 * wording that re-expresses a number ("1.2k" for "1,200") is refused and
 * the user keeps the original form.
 */

const NUMBER_WORDS: Readonly<Record<string, string>> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7',
  eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12', thirteen: '13',
  fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18',
  nineteen: '19', twenty: '20', thirty: '30', forty: '40', fifty: '50', sixty: '60',
  seventy: '70', eighty: '80', ninety: '90', hundred: '100', thousand: '1000',
  million: '1000000', billion: '1000000000', dozen: '12',
}

// A number not glued to a preceding digit/separator, optional magnitude suffix.
const DIGITS = /(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)([kmb])?(?![a-z])/gi
const DIGITS_LOOSE = /(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)/gi
const WORDS = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'gi')

interface Hit {
  index: number
  token: string
}

function digitHits(text: string): Hit[] {
  const hits: Hit[] = []
  const covered = new Set<number>()
  for (const m of text.matchAll(DIGITS)) {
    const value = m[1]!.replace(/,/g, '')
    hits.push({ index: m.index ?? 0, token: `${value}${(m[2] ?? '').toLowerCase()}` })
    covered.add(m.index ?? 0)
  }
  // Numbers followed by letters ("5ms", "p95x") are still numbers.
  for (const m of text.matchAll(DIGITS_LOOSE)) {
    if (!covered.has(m.index ?? 0)) hits.push({ index: m.index ?? 0, token: m[1]!.replace(/,/g, '') })
  }
  return hits
}

function wordHits(text: string): Hit[] {
  return [...text.matchAll(WORDS)].map((m) => ({
    index: m.index ?? 0,
    token: NUMBER_WORDS[m[1]!.toLowerCase()]!,
  }))
}

/** Every number in `text`, normalized, in reading order. */
export function extractNumbers(text: string): string[] {
  return [...digitHits(text), ...wordHits(text)]
    .sort((a, b) => a.index - b.index)
    .map((h) => h.token)
}

export interface FactLockResult {
  ok: boolean
  /** Numbers in the wording that the source does not contain (unique, in order). */
  missing: string[]
}

/** Does every number in `wording` appear in `source`? */
export function checkFactLock(wording: string, source: string): FactLockResult {
  const known = new Set(extractNumbers(source))
  const missing: string[] = []
  for (const n of extractNumbers(wording)) {
    if (!known.has(n) && !missing.includes(n)) missing.push(n)
  }
  return { ok: missing.length === 0, missing }
}

/** User-facing reason for a failed lock. */
export function factLockMessage(result: FactLockResult): string {
  return `Numbers not in the original: ${result.missing.join(', ')}`
}

// ---------------------------------------------------------------------------
// Domain wording lock
// ---------------------------------------------------------------------------

/**
 * Verbs that claim hands-on implementation. An item that is only
 * domain-ready (the user owns the idea and design, the code was
 * AI-assisted) may be shown only in wording free of these — "Designed the
 * ZATCA clearance flow", never "Built the ZATCA integration".
 */
// Past tense and -ing forms only: present forms double as nouns ("build
// pipeline", "code review") and would refuse honest design wordings.
const IMPLEMENTATION_CLAIMS = [
  'built', 'building', 'implemented', 'implementing', 'coded', 'coding', 'wrote', 'writing',
  'written', 'developed', 'developing', 'programmed', 'programming', 'engineered', 'shipped',
  'deployed', 'integrated', 'refactored', 'debugged', 'hand-wrote', 'hand-coded', 'from scratch',
]
const CLAIM_PATTERN = new RegExp(`\\b(${IMPLEMENTATION_CLAIMS.map((w) => w.replace(/-/g, '\\-')).join('|')})\\b`, 'gi')

export interface DomainLockResult {
  ok: boolean
  /** Implementation claims found (lower-case, unique, in order). */
  claims: string[]
}

/** Is `text` framed as design / domain work (no implementation claims)? */
export function checkDomainWording(text: string): DomainLockResult {
  const claims: string[] = []
  for (const m of text.matchAll(CLAIM_PATTERN)) {
    const claim = m[1]!.toLowerCase()
    if (!claims.includes(claim)) claims.push(claim)
  }
  return { ok: claims.length === 0, claims }
}

export function domainLockMessage(result: DomainLockResult): string {
  return `Phrase this as design or domain work — it claims implementation: ${result.claims.join(', ')}`
}
