/**
 * Text helpers for radar items: plain text from HTML/Markdown snippets,
 * capped excerpts (≤ 500 characters, email addresses removed), and the
 * normalisations used for clustering. Pure.
 */

export const EXCERPT_MAX = 500
export const TITLE_MAX = 300

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
  '#x27': "'",
  '#x2F': '/',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
}

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
    const named = ENTITIES[code] ?? ENTITIES[code.toLowerCase()]
    if (named !== undefined) return named
    if (code.startsWith('#')) {
      const n = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m
    }
    return m
  })
}

/** Tags, CDATA and entities out; whitespace collapsed. */
export function plainText(s: string | null | undefined): string {
  if (!s) return ''
  const noCdata = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  const noTags = noCdata.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ')
  return decodeEntities(noTags)
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?)])/g, '$1')
    .trim()
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

/** A stored excerpt: plain text, no email addresses, at most EXCERPT_MAX characters. */
export function excerptOf(s: string | null | undefined, max = EXCERPT_MAX): string {
  return truncate(plainText(s).replace(EMAIL, '[email]'), Math.min(max, EXCERPT_MAX))
}

export function titleOf(s: string | null | undefined): string {
  return truncate(plainText(s), TITLE_MAX)
}

/** "Mistral-Large 4!" → "mistrallarge4" (letters and digits only, NFKC, lower case). */
export function normalizeName(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

const DROP_HOSTS_PREFIX = /^(www\.|m\.)/

/**
 * A URL reduced to what identifies the thing it points at: host without
 * www, path without trailing slash, no hash, and only the query parameters
 * that identify a page (tracking parameters dropped). GitHub and Hugging
 * Face links keep only owner/name, so a repo's README, issues and releases
 * cluster together. Null for anything that is not http(s).
 */
export function canonicalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.toLowerCase().replace(DROP_HOSTS_PREFIX, '')
  const parts = u.pathname.split('/').filter(Boolean)
  if (host === 'github.com' && parts.length >= 2) return `github.com/${parts[0]}/${parts[1]}`.toLowerCase()
  if (host === 'huggingface.co' && parts.length >= 2) {
    const typed = parts[0] === 'spaces' || parts[0] === 'datasets'
    if (typed && parts.length >= 3) return `huggingface.co/${parts[0]}/${parts[1]}/${parts[2]}`.toLowerCase()
    if (!typed && !['blog', 'papers', 'docs', 'api'].includes(parts[0] ?? '')) {
      return `huggingface.co/${parts[0]}/${parts[1]}`.toLowerCase()
    }
  }
  const path = parts.join('/')
  const query = identifyingQuery(u.searchParams)
  return `${path ? `${host}/${path}` : host}${query}`
}

const TRACKING_PARAM = /^(utm_\w+|ref|ref_src|source|fbclid|gclid|mc_cid|mc_eid|s|si)$/i

/** Query parameters that identify a page (`item?id=1`), sorted; tracking ones dropped. */
function identifyingQuery(params: URLSearchParams): string {
  const kept = [...params.entries()].filter(([k]) => !TRACKING_PARAM.test(k)).sort(([a], [b]) => a.localeCompare(b))
  return kept.length === 0 ? '' : `?${new URLSearchParams(kept).toString()}`
}

/** arXiv id ("2610.10538") from an id or an arxiv.org / HF papers URL, version dropped. */
export function arxivIdOf(raw: string | null | undefined): string | null {
  if (!raw) return null
  const m = /(?:^|arxiv\.org\/(?:abs|pdf)\/|huggingface\.co\/papers\/|arxiv:)(\d{4}\.\d{4,5})(?:v\d+)?/i.exec(raw.trim())
  return m ? (m[1] as string) : null
}

/** "org/Model-Name" → "Model-Name". */
export function repoName(fullName: string): string {
  const parts = fullName.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? fullName
}

/** Valid Date or null. */
export function dateOrNull(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null
  const d = typeof v === 'number' ? new Date(v * 1000) : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

/** yyyy-mm-dd or undefined. */
export function dayOf(v: unknown): string | undefined {
  return dateOrNull(v)?.toISOString().slice(0, 10)
}
