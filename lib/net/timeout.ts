/**
 * Outbound-call timeouts. Every request that leaves the app (AI providers,
 * Google APIs, latexonline, Firecrawl, discovery sources) carries an
 * `AbortSignal.timeout`, so one hung upstream cannot pin a serverless
 * function (and its CPU/duration budget) until the platform kills it.
 *
 * Values are per attempt: a retrying caller gets a fresh timeout per try.
 * Interactive AI / document routes run with `maxDuration = 30`, so the
 * per-attempt budgets for calls made from them stay below 30 s.
 */

/** Groq chat completion, per attempt. JSON-mode answers normally land in seconds. */
export const GROQ_ATTEMPT_TIMEOUT_MS = 25_000
/** Groq Whisper transcription — under the route's maxDuration (30 s). */
export const GROQ_TRANSCRIBE_TIMEOUT_MS = 25_000
/** Gemini generateContent, per attempt (the fallback model gets its own). */
export const GEMINI_ATTEMPT_TIMEOUT_MS = 25_000
/** Laya decision Space: POST and SSE read, each. Short, so the Groq/heuristic fallback still fits. */
export const LAYA_TIMEOUT_MS = 10_000
/** latexonline.cc compile — under the 30 s maxDuration of the compile/PDF routes. */
export const LATEX_COMPILE_TIMEOUT_MS = 25_000
/** Firecrawl scrape (renders the page on their side). */
export const FIRECRAWL_TIMEOUT_MS = 20_000
/** Gmail REST calls (list, get thread, send). */
export const GMAIL_TIMEOUT_MS = 15_000
/** Google Calendar REST calls. */
export const CALENDAR_TIMEOUT_MS = 15_000
/** Google OAuth token refresh. */
export const GOOGLE_TOKEN_TIMEOUT_MS = 10_000
/** GitHub public-repos listing. */
export const GITHUB_TIMEOUT_MS = 10_000
/** One ATS probe while detecting a company's job board. */
export const ATS_PROBE_TIMEOUT_MS = 5_000
/** One discovery-source request (job board API, RSS feed, careers page). */
export const DISCOVERY_FETCH_TIMEOUT_MS = 15_000
/** One Hacker News item fetch (the adapter makes up to 100 of these). */
export const HN_ITEM_TIMEOUT_MS = 5_000

const TIMEOUT_TAG = Symbol.for('employ.outboundTimeout')

/** Plain `Error` (what every caller already handles) tagged as a timeout. */
export function timeoutError(label: string, timeoutMs: number, cause?: unknown): Error {
  const err = new Error(`${label} timed out after ${timeoutMs}ms`, cause ? { cause } : undefined)
  Object.defineProperty(err, TIMEOUT_TAG, { value: true })
  return err
}

/**
 * True for an `AbortSignal.timeout` rejection (DOMException "TimeoutError")
 * and for errors built by `timeoutError`.
 */
export function isTimeoutError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false
  if ((e as Record<symbol, unknown>)[TIMEOUT_TAG] === true) return true
  return (e as { name?: unknown }).name === 'TimeoutError'
}

/** A timeout signal, merged with the caller's own signal when there is one. */
export function timeoutSignal(timeoutMs: number, signal?: AbortSignal | null): AbortSignal {
  const t = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, t]) : t
}

/**
 * `fetch` with a hard timeout. A timeout surfaces as a plain `Error`
 * ("<label> timed out after <n>ms"); anything else (network errors, a
 * caller abort) is re-thrown unchanged. The same signal also bounds reading
 * the body, so a stalled stream cannot hang the caller either.
 */
export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
  opts: { timeoutMs: number; label: string },
): Promise<Response> {
  try {
    return await fetch(input, { ...init, signal: timeoutSignal(opts.timeoutMs, init.signal) })
  } catch (e) {
    if (isTimeoutError(e)) throw timeoutError(opts.label, opts.timeoutMs, e)
    throw e
  }
}
