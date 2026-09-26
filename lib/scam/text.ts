import type { EvidenceSpan, ScamField, ScamFields, ScamInput } from './types'

export const ALL_FIELDS: readonly ScamField[] = [
  'title',
  'company',
  'description',
  'url',
  'applyUrl',
  'applyEmail',
  'companyDomain',
  'salary',
  'location',
  'source',
]

/** Fields that carry free text a rule should scan for phrases. */
export const TEXT_FIELDS: readonly ScamField[] = ['title', 'description', 'salary', 'location']

/**
 * Render the structured salary as a stable string so salary evidence is
 * still a verbatim substring of a field (the `salary` field).
 */
export function renderSalary(input: ScamInput['salary']): string {
  if (!input) return ''
  const min = typeof input.min === 'number' && Number.isFinite(input.min) ? input.min : null
  const max = typeof input.max === 'number' && Number.isFinite(input.max) ? input.max : null
  if (min === null && max === null) return ''
  const ccy = (input.currency ?? '').trim()
  const range = min !== null && max !== null ? `${min}-${max}` : String(min ?? max)
  return ccy ? `${ccy} ${range}` : range
}

export function toFields(input: ScamInput): ScamFields {
  const s = (v: string | null | undefined): string => (typeof v === 'string' ? v : '')
  return {
    title: s(input.title),
    company: s(input.company),
    description: s(input.description),
    url: s(input.url),
    applyUrl: s(input.applyUrl),
    applyEmail: s(input.applyEmail),
    companyDomain: s(input.companyDomain),
    salary: renderSalary(input.salary),
    location: s(input.location),
    source: s(input.source),
  }
}

const NEGATION_BEFORE =
  /\b(no|never|not|don'?t|do not|doesn'?t|does not|won'?t|will not|without|zero|nor|neither|free of|isn'?t|aren'?t)\b/i
const NEGATION_AFTER =
  /^[\s:\-–—]*(is |are |will be |shall be )?(nil|none|not (charged|required|applicable|collected|taken)|waived|zero|free|(borne|covered|paid|taken care of) by (the )?(company|employer|us))\b/i
const SENTENCE_BREAK = /[.!?\n;•,]/

/**
 * True when the phrase at [start, end) is negated in its own sentence —
 * "we never charge a registration fee", "registration fee: nil".
 */
export function isNegated(text: string, start: number, end: number): boolean {
  const before = text.slice(Math.max(0, start - 40), start)
  let cut = -1
  for (let i = before.length - 1; i >= 0; i--) {
    if (SENTENCE_BREAK.test(before.charAt(i))) {
      cut = i
      break
    }
  }
  const clause = before.slice(cut + 1)
  if (NEGATION_BEFORE.test(clause)) return true
  const after = text.slice(end, end + 32)
  return NEGATION_AFTER.test(after)
}

export interface FindOptions {
  /** Skip matches negated in their sentence. Default false. */
  negatable?: boolean
  /** Stop after this many spans. Default 3. */
  max?: number
}

/**
 * Every match of `pattern` in `fields`, as verbatim spans. The pattern is
 * re-created with the `g` + `i` flags so callers can pass a plain literal.
 */
export function findAll(
  fields: ScamFields,
  pattern: RegExp,
  onFields: readonly ScamField[] = TEXT_FIELDS,
  opts: FindOptions = {},
): EvidenceSpan[] {
  const max = opts.max ?? 3
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  const re = new RegExp(pattern.source, flags.includes('i') ? flags : `${flags}i`)
  const out: EvidenceSpan[] = []
  for (const field of onFields) {
    const text = fields[field]
    if (!text) continue
    for (const m of text.matchAll(re)) {
      const matched = m[0]
      const start = m.index ?? 0
      if (!matched) continue
      if (opts.negatable && isNegated(text, start, start + matched.length)) continue
      out.push({ field, start, text: matched })
      if (out.length >= max) return out
    }
  }
  return out
}

/** First case-insensitive occurrence of `needle` in `field`, as a span. */
export function spanOf(fields: ScamFields, field: ScamField, needle: string): EvidenceSpan | null {
  if (!needle) return null
  const hay = fields[field]
  const idx = hay.toLowerCase().indexOf(needle.toLowerCase())
  if (idx < 0) return null
  return { field, start: idx, text: hay.slice(idx, idx + needle.length) }
}

/** True when every span is a verbatim slice of its field. */
export function spansAreVerbatim(fields: ScamFields, spans: readonly EvidenceSpan[]): boolean {
  return spans.every((s) => fields[s.field].slice(s.start, s.start + s.text.length) === s.text)
}
