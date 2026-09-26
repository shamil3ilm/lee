import { createHmac, timingSafeEqual } from 'node:crypto'

/** Accept worker requests signed within this window of our clock. */
export const SIGNATURE_MAX_SKEW_MS = 5 * 60 * 1000

export const TIMESTAMP_HEADER = 'x-queue-timestamp'
export const SIGNATURE_HEADER = 'x-queue-signature'

/**
 * HMAC-SHA256 over `${timestamp}.${body}` (timestamp = unix seconds),
 * hex-encoded. The GitHub Actions workflow computes the same with openssl.
 */
export function signQueueRequest(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
}

export type VerifyFailure = 'missing' | 'stale' | 'bad_signature'

/**
 * Verify a signed worker request: timestamp present, numeric and within
 * ±SIGNATURE_MAX_SKEW_MS, and the signature equal to ours (constant-time).
 */
export function verifyQueueRequest(args: {
  secret: string
  timestamp: string | null
  signature: string | null
  body: string
  now?: number
}): { ok: true } | { ok: false; reason: VerifyFailure } {
  const { secret, timestamp, signature, body } = args
  if (!timestamp || !signature) return { ok: false, reason: 'missing' }
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: 'stale' }
  const now = args.now ?? Date.now()
  if (Math.abs(now - Number(timestamp) * 1000) > SIGNATURE_MAX_SKEW_MS) return { ok: false, reason: 'stale' }
  const expected = Buffer.from(signQueueRequest(secret, timestamp, body), 'hex')
  const given = /^[0-9a-f]{64}$/i.test(signature) ? Buffer.from(signature, 'hex') : Buffer.alloc(0)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'bad_signature' }
  }
  return { ok: true }
}
