/**
 * Keeps personal identifiers out of text lee hands to Google (AI Mode
 * prompts) or to an AI provider. Prompts are built from search preferences
 * only; this is the second line of defence for the free-text preference
 * fields (custom role names, keywords) a user might have typed a name,
 * employer, email or phone number into.
 *
 * Pure and client-safe.
 */

/** Anything shaped like an email address. */
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
/** Phone-like runs: 7+ digits with optional +, spaces, dots, dashes or brackets. */
const PHONE_RE = /\+?\(?\d[\d\s().-]{5,}\d/g
/** Too short to be a meaningful identifier (initials, "AI", "Go"). */
const MIN_TERM_LENGTH = 3

export interface PiiSource {
  basics?: { name?: string | null; email?: string | null; phone?: string | null } | null
  /** Work history: each employer's name. */
  work?: ReadonlyArray<{ name?: string | null }> | null
  /** Schools and certificate issuers are identifying too. */
  education?: ReadonlyArray<{ institution?: string | null }> | null
}

function words(value: string | null | undefined): string[] {
  const v = (value ?? '').trim()
  return v ? [v] : []
}

/**
 * Identifiers from the master profile that must never leave lee in a
 * prompt: the full name and each part of it, email, phone, employers and
 * schools.
 */
export function piiTermsFromProfile(src: PiiSource | null | undefined): string[] {
  if (!src) return []
  const name = (src.basics?.name ?? '').trim()
  const nameParts = name.split(/\s+/).filter((p) => p.length >= MIN_TERM_LENGTH)
  const terms = [
    ...words(name),
    ...nameParts,
    ...words(src.basics?.email),
    ...words(src.basics?.phone),
    ...(src.work ?? []).flatMap((w) => words(w.name)),
    ...(src.education ?? []).flatMap((e) => words(e.institution)),
  ]
  const seen = new Set<string>()
  return terms.filter((t) => {
    const k = t.toLowerCase()
    if (t.length < MIN_TERM_LENGTH || seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Remove emails, phone numbers and every listed identifier (whole words,
 * case-insensitive), then tidy the whitespace and stray punctuation left
 * behind.
 */
export function scrubPii(text: string, terms: readonly string[]): string {
  let out = text.replace(EMAIL_RE, ' ').replace(PHONE_RE, ' ')
  // Longest first, so "Acme Corp" goes before "Acme".
  for (const term of [...terms].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(term)}(?=$|[^\\p{L}\\p{N}])`, 'giu')
    out = out.replace(re, '$1 ')
  }
  return out
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/([,;:])(?:\s*[,;:])+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:.-]+|[\s,;:-]+$/g, '')
    .trim()
}
