import type { RateLimitSnapshot } from './rate-limit-headers'

/**
 * Per-attempt classification for AI provider calls, so every failed attempt
 * (retries included) becomes its own ai_call_logs row with a status and the
 * HTTP status, and 429s are visible in analytics.
 */

/** A non-2xx provider response. The message keeps the historic "<label> <status>: <body>" shape. */
export class AiHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly rateLimit: RateLimitSnapshot | null = null,
  ) {
    super(message)
    this.name = 'AiHttpError'
  }
}

/** HTTP status of a failed attempt, from our error, an SDK error, or the message. */
export function httpStatusOf(err: unknown): number | null {
  if (err && typeof err === 'object' && 'status' in err) {
    const s = (err as { status?: unknown }).status
    if (typeof s === 'number' && s >= 100 && s <= 599) return s
  }
  const msg = err instanceof Error ? err.message : String(err ?? '')
  // "groq 429: …" or the Gemini SDK's "[429 Too Many Requests]".
  const m = msg.match(/^[\w ]+? (\d{3}):/) ?? msg.match(/\[(\d{3})[ \]]/)
  return m ? Number(m[1]) : null
}

export function attemptStatus(err: unknown): 'rate_limited' | 'error' {
  if (httpStatusOf(err) === 429) return 'rate_limited'
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return /RESOURCE_EXHAUSTED|rate limit/i.test(msg) ? 'rate_limited' : 'error'
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
