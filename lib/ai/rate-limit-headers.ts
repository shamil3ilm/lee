/**
 * Groq rate-limit response headers → snapshot.
 *
 * Verified against https://console.groq.com/docs/rate-limits (2026-09-26):
 *   x-ratelimit-limit-requests      requests per DAY (RPD)
 *   x-ratelimit-limit-tokens        tokens per MINUTE (TPM)
 *   x-ratelimit-remaining-requests  remaining RPD
 *   x-ratelimit-remaining-tokens    remaining TPM
 *   x-ratelimit-reset-requests      time until RPD resets, e.g. "2m59.56s"
 *   x-ratelimit-reset-tokens        time until TPM resets, e.g. "7.66s"
 *   retry-after                     seconds; only set on a 429
 */
export interface RateLimitSnapshot {
  limitRequests: number | null
  remainingRequests: number | null
  resetRequestsAt: Date | null
  limitTokens: number | null
  remainingTokens: number | null
  resetTokensAt: Date | null
  retryAfterAt: Date | null
}

const UNIT_MS: Record<string, number> = { h: 3_600_000, m: 60_000, s: 1_000, ms: 1 }

/** "2m59.56s" / "7.66s" / "250ms" / "12" (seconds) → milliseconds. */
export function parseGroqDuration(value: string | null | undefined): number | null {
  if (!value) return null
  const v = value.trim()
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(Number(v) * 1_000)
  const parts = [...v.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)]
  if (parts.length === 0 || parts.map((p) => p[0]).join('') !== v) return null
  return Math.round(parts.reduce((sum, p) => sum + Number(p[1]) * UNIT_MS[p[2]!]!, 0))
}

function int(headers: Headers, name: string): number | null {
  const raw = headers.get(name)
  if (raw == null || raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? Math.round(n) : null
}

function at(now: Date, ms: number | null): Date | null {
  return ms == null ? null : new Date(now.getTime() + ms)
}

export function parseGroqRateLimitHeaders(
  headers: Headers | undefined | null,
  now: Date = new Date(),
): RateLimitSnapshot | null {
  if (!headers || typeof headers.get !== 'function') return null
  const snap: RateLimitSnapshot = {
    limitRequests: int(headers, 'x-ratelimit-limit-requests'),
    remainingRequests: int(headers, 'x-ratelimit-remaining-requests'),
    resetRequestsAt: at(now, parseGroqDuration(headers.get('x-ratelimit-reset-requests'))),
    limitTokens: int(headers, 'x-ratelimit-limit-tokens'),
    remainingTokens: int(headers, 'x-ratelimit-remaining-tokens'),
    resetTokensAt: at(now, parseGroqDuration(headers.get('x-ratelimit-reset-tokens'))),
    retryAfterAt: at(now, parseGroqDuration(headers.get('retry-after'))),
  }
  const hasAny =
    snap.limitRequests != null ||
    snap.remainingRequests != null ||
    snap.limitTokens != null ||
    snap.remainingTokens != null ||
    snap.retryAfterAt != null
  return hasAny ? snap : null
}
