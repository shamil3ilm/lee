import { SKILL_GROUPS } from '@/lib/discovery/relevance/roles'
import { detectYearsRequired } from '@/lib/discovery/relevance/seniority'
import { normalizeForMatch } from '@/lib/discovery/relevance/text'
import { quoteAround, type EvidenceDraft } from './evidence'

/**
 * Signals read from the FULL job description, never the title alone: the
 * tech it names, the scope of the role (team / leadership, ownership and
 * architecture, years asked), travel and the work mode it states. Every
 * signal keeps the JD line it came from as its quote. A posting with too
 * little description is "thin": its JD-based criteria are unknown and the
 * UI offers "Paste the JD".
 */

/** Below this many characters a description can't support JD signals. */
export const MIN_JD_CHARS = 200

export type JdStatus = 'ok' | 'thin'

export function jdStatus(description: string | null | undefined): JdStatus {
  return (description ?? '').trim().length >= MIN_JD_CHARS ? 'ok' : 'thin'
}

/** Ordinary English words that are also tech names; too noisy to read from prose. */
const AMBIGUOUS = new Set([
  'go', 'express', 'spring', 'phoenix', 'rails', 'node', 'lambda', 'helm', 'orm',
  // Role and practice words, not tech to learn.
  'backend', 'back-end', 'server-side', 'frontend', 'front-end', 'devops', 'serverless', 'microservices',
  'restful', 'rest api', 'token tracking', 'cost tracking', 'ai integration', 'partner apis', 'partner api',
  'third-party integrations', 'third party integrations', 'prompt engineering',
])

const TECH_TERMS: readonly string[] = [
  ...new Set(
    [
      ...SKILL_GROUPS.backend,
      ...SKILL_GROUPS.frontend,
      ...SKILL_GROUPS.devops,
      ...SKILL_GROUPS.llm,
      ...SKILL_GROUPS.integrations,
    ].filter((t) => !AMBIGUOUS.has(t)),
  ),
  // Longest first, so "postgresql" wins over "postgres" and "node.js" over "node".
].sort((a, b) => b.length - a.length)

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function termRe(term: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(term)}(?![\\p{L}\\p{N}])`, 'iu')
}

const TERM_RES = new Map(TECH_TERMS.map((t) => [t, termRe(t)] as const))

export interface JdTech {
  term: string
  quote: string
}

/** Tech named in the JD text, each with the line it appears on (first 8,000 chars). */
export function techInJd(description: string | null | undefined): JdTech[] {
  const src = (description ?? '').slice(0, 8_000)
  if (!src) return []
  const out: JdTech[] = []
  for (const [term, re] of TERM_RES) {
    const m = re.exec(src)
    if (!m) continue
    const n = normalizeForMatch(term)
    if (out.some((o) => normalizeForMatch(o.term).includes(n) || n.includes(normalizeForMatch(o.term)))) continue
    out.push({ term: m[0], quote: quoteAround(src, m.index, m[0].length) })
  }
  return out
}

const posting = (src: string, m: RegExpExecArray): EvidenceDraft['source'] => ({
  kind: 'posting',
  label: 'Job description',
  quote: quoteAround(src, m.index, m[0].length),
})

const LEAD_RE =
  /\b(?:lead|leading|manage|managing)\s+(?:a\s+|the\s+)?(?:small\s+)?(?:team|squad|group)\b|\bmentor(?:ing)?\s+(?:junior|other|the\s+team)|\bline\s+management\b|\bdirect\s+reports?\b|\btech(?:nical)?\s+lead\b/i
const OWN_RE = /\bown(?:ing|ership\s+of)?\s+(?:the\s+)?(?:design|architecture|roadmap|service|services|platform|module|system)s?\b|\bend[\s-]to[\s-]end\s+ownership\b|\barchitect(?:ing)?\s+(?:the\s+|our\s+|new\s+)?(?:system|platform|service)s?\b|\bsystem\s+design\b/i
const TRAVEL_RE = /\btravel(?:l?ing)?\s+(?:up\s+to\s+)?\d{1,2}\s*%|\bfrequent\s+travel\b|\btravel\s+(?:is\s+)?required\b|\bwilling(?:ness)?\s+to\s+travel\b/i

/** Role scope from the JD: team / leadership, ownership / architecture, years asked. */
export function scopeSignals(description: string): EvidenceDraft[] {
  const src = description.slice(0, 8_000)
  const out: EvidenceDraft[] = []
  const lead = LEAD_RE.exec(src)
  if (lead) out.push({ text: 'Team or leadership scope', effect: 8, confidence: 'known', source: posting(src, lead) })
  const own = OWN_RE.exec(src)
  if (own) out.push({ text: 'Ownership or architecture scope', effect: 5, confidence: 'known', source: posting(src, own) })
  const years = detectYearsRequired(src)
  if (years !== null) {
    out.push({ text: `Asks for ${years}+ years of experience`, effect: 0, confidence: 'known', source: { kind: 'posting', label: 'Job description' } })
  }
  return out
}

export function travelSignal(description: string): EvidenceDraft[] {
  const src = description.slice(0, 8_000)
  const m = TRAVEL_RE.exec(src)
  return m ? [{ text: 'Travel required', effect: -5, confidence: 'known', source: posting(src, m) }] : []
}

const MODE_RES: ReadonlyArray<[RegExp, 'remote' | 'hybrid' | 'onsite']> = [
  [/\bfully\s+remote\b|\bremote[\s-]first\b|\b100%\s+remote\b|\bwork\s+from\s+anywhere\b/i, 'remote'],
  [/\bhybrid\s+(?:work|working|model|role|setup)\b|\b\d\s+days?\s+(?:a\s+week\s+)?(?:in|from)\s+(?:the\s+)?office\b/i, 'hybrid'],
  [/\bon[\s-]?site\b|\bin[\s-]office\b|\boffice[\s-]based\b|\bwork\s+from\s+(?:the\s+|our\s+)?office\b/i, 'onsite'],
]

/** The work mode the JD states, with its line; null when it says nothing. */
export function workModeInJd(description: string): { mode: 'remote' | 'hybrid' | 'onsite'; quote: string } | null {
  const src = description.slice(0, 8_000)
  for (const [re, mode] of MODE_RES) {
    const m = re.exec(src)
    if (m) return { mode, quote: quoteAround(src, m.index, m[0].length) }
  }
  return null
}
