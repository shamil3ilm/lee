/**
 * v14 — typed provider errors. Messages are safe to show to the user: they
 * never contain raw provider response bodies (which can echo request
 * headers) and any provider-supplied message is redacted + truncated.
 */

export class ProviderError extends Error {
  readonly status?: number
  readonly code: 'provider_error' | 'auth' | 'network' | 'timeout' | 'bad_request' | 'missing_key'
  constructor(
    message: string,
    opts: { status?: number; code?: ProviderError['code'] } = {},
  ) {
    super(message)
    this.name = 'ProviderError'
    this.status = opts.status
    this.code = opts.code ?? 'provider_error'
  }
}

export class RateLimitedError extends ProviderError {
  readonly retryAfterSec?: number
  constructor(message: string, retryAfterSec?: number) {
    super(message, { status: 429 })
    this.name = 'RateLimitedError'
    this.retryAfterSec = retryAfterSec
  }
}

export class MissingKeyError extends ProviderError {
  constructor(providerLabel: string) {
    super(`No API key for ${providerLabel} — add a key in Model Playground › Providers.`, {
      code: 'missing_key',
    })
    this.name = 'MissingKeyError'
  }
}

// Common API-key shapes: OpenAI/OpenRouter `sk-…`, Groq `gsk_…`, HF `hf_…`,
// Cerebras `csk-…`, Google `AIza…`, plus any long opaque token.
const KEY_PATTERNS = [
  /\b(sk|gsk|csk|hf|sk-or-v1)[-_][A-Za-z0-9_-]{8,}/g,
  /AIza[0-9A-Za-z_-]{20,}/g,
  /Bearer\s+\S+/gi,
  /[A-Za-z0-9_-]{32,}/g,
]

/** Redact anything that looks like a credential and cap the length. */
export function redactSecrets(text: string, knownSecrets: string[] = []): string {
  let out = text
  for (const s of knownSecrets) {
    if (s && s.length >= 4) out = out.split(s).join('[redacted]')
  }
  for (const re of KEY_PATTERNS) out = out.replace(re, '[redacted]')
  return out.length > 200 ? `${out.slice(0, 200)}…` : out
}

export function isRateLimited(e: unknown): e is RateLimitedError {
  return e instanceof RateLimitedError
}

/** Short, user-safe message for any thrown value. */
export function safeErrorMessage(e: unknown): string {
  if (e instanceof ProviderError) return e.message
  return 'Model call failed.'
}
