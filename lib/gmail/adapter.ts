/**
 * Thin wrapper around Gmail's REST API v1. Only the read paths the sync loop
 * needs are covered here. The application-matching sync reads headers +
 * snippet only; message bodies are fetched solely for job-alert emails
 * (see the section at the end), parsed in memory and never stored.
 *
 * All calls take the caller's access token (already refreshed by
 * `lib/google/tokens.ts`) so this module is stateless and easy to test.
 */
import { fetchWithTimeout, GMAIL_TIMEOUT_MS } from '@/lib/net/timeout'

export interface GmailTokens {
  accessToken: string
}

export interface GmailThreadSummary {
  id: string
  historyId: string
  snippet: string
}

export interface GmailHeader {
  name: string
  value: string
}

export interface GmailMessage {
  id: string
  threadId: string
  labelIds?: string[]
  snippet: string
  internalDate: string
  payload: {
    headers: GmailHeader[]
  }
}

export interface GmailThreadFull {
  id: string
  historyId?: string
  messages: GmailMessage[]
}

interface ListThreadsArgs {
  tokens: GmailTokens
  /**
   * If provided, we still cap the query at the last 30 days (Gmail's
   * `newer_than:30d`) to keep quota use bounded. `since` is retained on the
   * signature for future use — the sync service passes `syncedGmailAt` but the
   * REST call ignores it today.
   */
  since?: Date
  maxResults?: number
}

/**
 * List thread summaries from the user's inbox for the last 30 days. Gmail
 * pages at 100 by default; we do not paginate — a single page keeps the sync
 * bounded and predictable. Users with heavier inboxes can raise this later.
 */
export async function listThreads({ tokens, maxResults = 100 }: ListThreadsArgs): Promise<GmailThreadSummary[]> {
  const params = new URLSearchParams({ q: 'newer_than:30d', maxResults: String(maxResults) })
  const res = await fetchWithTimeout(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads?${params.toString()}`,
    { headers: { authorization: `Bearer ${tokens.accessToken}` } },
    { timeoutMs: GMAIL_TIMEOUT_MS, label: 'gmail listThreads' },
  )
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`gmail listThreads ${res.status}: ${detail}`)
  }
  const json = (await res.json()) as { threads?: GmailThreadSummary[] }
  return json.threads ?? []
}

/**
 * Fetch a single thread with metadata-only messages (From/To/Cc/Subject/Date
 * headers + snippet). Cheaper than `format=full` and enough for the matcher.
 */
export async function getThread({
  tokens,
  threadId,
}: {
  tokens: GmailTokens
  threadId: string
}): Promise<GmailThreadFull> {
  const params = new URLSearchParams({ format: 'metadata' })
  for (const h of ['From', 'To', 'Cc', 'Subject', 'Date']) {
    params.append('metadataHeaders', h)
  }
  const res = await fetchWithTimeout(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?${params.toString()}`,
    { headers: { authorization: `Bearer ${tokens.accessToken}` } },
    { timeoutMs: GMAIL_TIMEOUT_MS, label: 'gmail getThread' },
  )
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`gmail getThread ${res.status}: ${detail}`)
  }
  return (await res.json()) as GmailThreadFull
}

/**
 * Case-insensitive header lookup. Gmail preserves the sent casing (e.g.
 * "From" vs "from"), which is why we don't index by exact key.
 */
export function extractHeader(msg: GmailMessage, name: string): string | undefined {
  const lower = name.toLowerCase()
  return msg.payload.headers.find((h) => h.name.toLowerCase() === lower)?.value
}

/**
 * Pull the bare email address out of a header value like `"Name <a@b.com>"`,
 * `"a@b.com"`, or `"Name <a@b.com>, Other <c@d.com>"`. Returns the first
 * address only, lowercased. Undefined when the header is missing or empty.
 */
export function extractEmailAddress(header: string | undefined): string | undefined {
  if (!header) return undefined
  const trimmed = header.trim()
  if (!trimmed) return undefined
  const angle = trimmed.match(/<([^>]+)>/)
  if (angle && angle[1]) return angle[1].trim().toLowerCase()
  // No angle brackets — assume the whole header IS the address (possibly with
  // trailing commas from a multi-recipient field; take up to the first comma).
  const first = trimmed.split(',')[0]?.trim()
  return first ? first.toLowerCase() : undefined
}

/**
 * Extract every email address in a header value (handles multi-recipient
 * To/Cc). Lowercased, deduplicated preserving order.
 */
export function extractAllEmailAddresses(header: string | undefined): string[] {
  if (!header) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const part of header.split(',')) {
    const addr = extractEmailAddress(part)
    if (addr && !seen.has(addr)) {
      seen.add(addr)
      out.push(addr)
    }
  }
  return out
}

/**
 * Extract the domain portion of an email (e.g. `stripe.com` from
 * `careers@stripe.com`). Lowercased. Undefined when the input is not a
 * conventional address.
 */
export function extractDomain(email: string | undefined): string | undefined {
  if (!email) return undefined
  const at = email.lastIndexOf('@')
  if (at < 0 || at === email.length - 1) return undefined
  return email.slice(at + 1).toLowerCase()
}

// ---------------------------------------------------------------------------
// Job-alert reading (lib/email-alerts). The one place a message body is
// fetched: only for messages from job-alert senders, decoded in memory for
// the parser and never stored.
// ---------------------------------------------------------------------------

export interface GmailMessageRef {
  id: string
  threadId: string
}

/** Message ids matching a Gmail search query (one page, newest first). */
export async function listMessageIds({
  tokens,
  q,
  maxResults = 50,
}: {
  tokens: GmailTokens
  q: string
  maxResults?: number
}): Promise<GmailMessageRef[]> {
  const params = new URLSearchParams({ q, maxResults: String(maxResults) })
  const res = await fetchWithTimeout(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
    { headers: { authorization: `Bearer ${tokens.accessToken}` } },
    { timeoutMs: GMAIL_TIMEOUT_MS, label: 'gmail listMessages' },
  )
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`gmail listMessages ${res.status}: ${detail.slice(0, 200)}`)
  }
  const json = (await res.json()) as { messages?: GmailMessageRef[] }
  return json.messages ?? []
}

export interface GmailPart {
  mimeType?: string
  headers?: GmailHeader[]
  body?: { data?: string; size?: number }
  parts?: GmailPart[]
}

export interface GmailMessageContent {
  id: string
  internalDate: string
  headers: GmailHeader[]
  html: string | null
  text: string | null
}

/** Bodies larger than this are cut (alert emails are well under it). */
export const MAX_BODY_BYTES = 1_000_000

function decodeBase64Url(data: string): string {
  const buf = Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  return buf.subarray(0, MAX_BODY_BYTES).toString('utf8')
}

/** First text/html and text/plain bodies in a MIME tree (depth-first). */
export function extractBodies(payload: GmailPart): { html: string | null; text: string | null } {
  let html: string | null = null
  let text: string | null = null
  const walk = (part: GmailPart, depth: number): void => {
    if (depth > 8 || (html !== null && text !== null)) return
    const type = (part.mimeType ?? '').toLowerCase()
    if (part.body?.data) {
      if (type === 'text/html' && html === null) html = decodeBase64Url(part.body.data)
      else if (type === 'text/plain' && text === null) text = decodeBase64Url(part.body.data)
    }
    for (const child of part.parts ?? []) walk(child, depth + 1)
  }
  walk(payload, 0)
  return { html, text }
}

/** One message with its decoded HTML / text parts (format=full). */
export async function getMessageContent({
  tokens,
  id,
}: {
  tokens: GmailTokens
  id: string
}): Promise<GmailMessageContent> {
  const res = await fetchWithTimeout(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`,
    { headers: { authorization: `Bearer ${tokens.accessToken}` } },
    { timeoutMs: GMAIL_TIMEOUT_MS, label: 'gmail getMessage' },
  )
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`gmail getMessage ${res.status}: ${detail.slice(0, 200)}`)
  }
  const json = (await res.json()) as { id: string; internalDate?: string; payload?: GmailPart }
  const payload = json.payload ?? {}
  return {
    id: json.id,
    internalDate: json.internalDate ?? '0',
    headers: payload.headers ?? [],
    ...extractBodies(payload),
  }
}
