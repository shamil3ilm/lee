/** Longest `last_error` stored on a job row. */
export const MAX_ERROR_LENGTH = 300

const REDACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  // Authorization headers and bearer tokens.
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [redacted]'],
  // key=value secrets in URLs, headers or messages.
  [/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|key|sig|signature)=([^\s&"']+)/gi, '$1=[redacted]'],
  // Query strings (may carry tokens) — keep the path.
  [/(https?:\/\/[^\s?#"']+)\?[^\s"']*/gi, '$1?[redacted]'],
  // Email addresses.
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  // Long opaque strings (API keys, JWTs, hashes) — but not UUIDs (row ids).
  [/\b(?![0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b)[A-Za-z0-9_-]{32,}(\.[A-Za-z0-9_-]+)*/gi, '[redacted]'],
]

/**
 * A job error safe to store and show to the owner: message only (no stack),
 * secrets, tokens, emails and query strings redacted, whitespace collapsed,
 * truncated to MAX_ERROR_LENGTH.
 */
export function sanitizeError(err: unknown): string {
  const raw =
    err instanceof Error
      ? `${err.name && err.name !== 'Error' ? `${err.name}: ` : ''}${err.message}`
      : typeof err === 'string'
        ? err
        : 'Unknown error'
  const cleaned = REDACTIONS.reduce((s, [re, rep]) => s.replace(re, rep), raw)
    .replace(/\s+/g, ' ')
    .trim()
  const text = cleaned || 'Unknown error'
  return text.length > MAX_ERROR_LENGTH ? `${text.slice(0, MAX_ERROR_LENGTH - 1)}…` : text
}

/** Thrown by the drain loop when a handler exceeds its per-type timeout. */
export class JobTimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after ${Math.round(ms / 1000)} s`)
    this.name = 'JobTimeoutError'
  }
}

/** A failure that retrying cannot fix (bad payload, unknown type). */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PermanentJobError'
  }
}
