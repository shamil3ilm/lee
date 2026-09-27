/**
 * Redaction for persisted events (system_events). Everything that reaches
 * the database passes through here:
 *
 * - secrets: Authorization / Cookie headers, bearer tokens, key=value
 *   secrets, provider keys (`gsk_`, `AIza`, `sk-`, `ghp_`/`github_pat_`),
 *   JWTs, query strings and long opaque strings are replaced;
 * - email addresses are reduced to their domain (`*@example.com`);
 * - context keeps numbers and booleans, but strings only under keys the
 *   event allow-lists, and never keys that name secrets or content (bodies,
 *   prompts, CV text, documents);
 * - the whole context is capped at MAX_CONTEXT_BYTES.
 */

export const MAX_CONTEXT_BYTES = 2048
export const MAX_MESSAGE_LENGTH = 300
const MAX_STRING_VALUE = 300
const MAX_KEYS = 30
const MAX_LIST = 10

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

const REDACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  // Header-style secrets: the rest of the line is the value.
  [/\b(authorization|proxy-authorization)\s*[:=]\s*[^\n,;]*/gi, '$1: [redacted]'],
  [/\b(set-cookie|cookie)\s*[:=]\s*[^\n]*/gi, '$1: [redacted]'],
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [redacted]'],
  // JWTs (header.payload.signature, base64url).
  [/\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g, '[redacted-jwt]'],
  // Provider keys.
  [/\bgsk_[A-Za-z0-9]{6,}/g, '[redacted-key]'],
  [/\bAIza[0-9A-Za-z_-]{6,}/g, '[redacted-key]'],
  [/\bsk-[A-Za-z0-9_-]{6,}/g, '[redacted-key]'],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{6,}|github_pat_[A-Za-z0-9_]{6,})/g, '[redacted-key]'],
  // key=value secrets in URLs, headers or messages.
  [
    /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|token|secret|client[_-]?secret|password|passwd|key|sig|signature|code)=([^\s&"']+)/gi,
    '$1=[redacted]',
  ],
  // Query strings (may carry tokens) — keep the path.
  [/(https?:\/\/[^\s?#"']+)\?[^\s"']*/gi, '$1?[redacted]'],
  // Email addresses → their domain.
  [/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '*@$1'],
  // Long opaque strings (keys, hashes) — but not UUIDs (row ids).
  [/\b(?![0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b)[A-Za-z0-9_-]{40,}/gi, '[redacted]'],
]

/** Redact secrets and emails in free text, collapse whitespace, truncate. */
export function redactText(input: string, maxLength = MAX_STRING_VALUE): string {
  const cleaned = REDACTIONS.reduce((s, [re, rep]) => s.replace(re, rep), input).replace(/\s+/g, ' ').trim()
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned
}

/**
 * Keys that are never stored, whatever their value: secrets, and content
 * (message bodies, prompts, CV / document text, raw payloads, addresses).
 */
const DENIED_KEY_RE =
  /(access|refresh|id|auth|bearer|csrf|session|oauth|api|push)_?token|^token$|secret|passw|api_?key|apikey|authorization|cookie|credential|prompt|snippet|body|html|stack|markdown|latex|transcript/i
const DENIED_KEYS = new Set([
  'content',
  'text',
  'subject',
  'from',
  'to',
  'cc',
  'bcc',
  'email',
  'address',
  'raw',
  'payload',
  'cv',
  'resume',
  'document',
  'description',
  'jd',
  'headers',
  'input',
  'output',
  'response',
  'request',
])

export function isDeniedKey(key: string): boolean {
  return DENIED_KEYS.has(key.toLowerCase()) || DENIED_KEY_RE.test(key)
}

const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/

function cleanValue(value: unknown, stringsAllowed: boolean): unknown {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean') return value
  if (value === null) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString()
  if (typeof value === 'string') return stringsAllowed ? redactText(value) : undefined
  if (value instanceof Error) return stringsAllowed ? redactText(value.message) : undefined
  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_LIST)
      .map((v) => (typeof v === 'number' || typeof v === 'boolean' ? cleanValue(v, false) : cleanValue(v, stringsAllowed)))
      .filter((v) => v !== undefined && (typeof v !== 'object' || v === null))
    return items.length > 0 ? items : undefined
  }
  if (typeof value === 'object') {
    // Flat numeric maps only (e.g. drain metrics); nested strings are dropped.
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, MAX_KEYS)) {
      if (KEY_RE.test(k) && !isDeniedKey(k) && typeof v === 'number' && Number.isFinite(v)) out[k] = v
    }
    return Object.keys(out).length > 0 ? out : undefined
  }
  return undefined
}

function byteLength(v: unknown): number {
  return new TextEncoder().encode(JSON.stringify(v)).length
}

/**
 * Context safe to persist: denied keys dropped, strings only under
 * `stringKeys` (redacted), numbers / booleans / flat numeric maps kept,
 * then capped at `maxBytes` by dropping the largest values first.
 */
export function sanitizeContext(
  fields: Readonly<Record<string, unknown>> | undefined,
  stringKeys: ReadonlySet<string>,
  maxBytes = MAX_CONTEXT_BYTES,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!fields) return out
  for (const [key, value] of Object.entries(fields)) {
    if (Object.keys(out).length >= MAX_KEYS) break
    if (!KEY_RE.test(key) || isDeniedKey(key)) continue
    const clean = cleanValue(value, stringKeys.has(key))
    if (clean !== undefined) out[key] = clean
  }
  if (byteLength(out) <= maxBytes) return out
  const bySize = Object.keys(out).sort((a, b) => byteLength(out[b]) - byteLength(out[a]))
  const capped = { ...out }
  for (const key of bySize) {
    delete capped[key]
    if (byteLength({ ...capped, truncated: true }) <= maxBytes) break
  }
  return { ...capped, truncated: true }
}
