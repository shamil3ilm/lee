import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Constant-time string equality for secrets (cron bearer tokens, shared
 * keys). Both sides are hashed to a fixed 32-byte digest first, so the
 * comparison takes the same time whatever the inputs' lengths are and
 * `timingSafeEqual` never throws on a length mismatch. An empty expected
 * value never matches: a missing secret must not authorize an empty header.
 */
export function secretsEqual(given: string, expected: string): boolean {
  if (expected.length === 0) return false
  const a = createHash('sha256').update(given, 'utf8').digest()
  const b = createHash('sha256').update(expected, 'utf8').digest()
  return timingSafeEqual(a, b)
}

/** `Authorization: Bearer <secret>` check, constant-time. */
export function isBearerAuthorized(authorization: string | null | undefined, secret: string): boolean {
  if (secret.length === 0) return false
  return secretsEqual(authorization ?? '', `Bearer ${secret}`)
}
