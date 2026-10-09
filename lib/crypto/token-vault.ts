import { decryptSecret, encryptSecret } from '@/lib/lab/crypto'

/**
 * SERVER-ONLY. At-rest encryption for OAuth tokens (Google today; GitHub and
 * LinkedIn connections next) stored in plain `text` columns.
 *
 * Reuses the service-key encryption (lib/lab/crypto.ts: AES-256-GCM, random
 * 12-byte IV per value, key derived from AUTH_SECRET via HKDF) and packs the
 * result into one self-describing string:
 *
 *     enc:v1:<iv b64url>.<auth tag b64url>.<ciphertext b64url>
 *
 * The `v1` prefix is the envelope version: a future key (e.g. a dedicated
 * ENCRYPTION_KEY with key ids) becomes `v2` and both decode side by side.
 *
 * - `encryptToken` is idempotent: an already-encrypted value is returned
 *   unchanged, so migrations and double writes are safe.
 * - `decryptToken` passes legacy plaintext through unchanged, so rows written
 *   before encryption keep working until they are re-encrypted (callers that
 *   read a plaintext value should re-save it encrypted; see
 *   lib/auth/account-tokens.ts).
 * - null/undefined pass through both ways (Auth.js leaves columns empty).
 */

const PREFIX = 'enc:v1:'
const B64URL = /^[A-Za-z0-9_-]+$/

function toB64url(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  return b64 + '='.repeat((4 - (b64.length % 4)) % 4)
}

/** True when `value` is a token-vault envelope (it does not verify the tag). */
export function isEncrypted(value: string | null | undefined): boolean {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return false
  const parts = value.slice(PREFIX.length).split('.')
  return parts.length === 3 && parts.every((p) => p.length > 0 && B64URL.test(p))
}

export function encryptToken(value: string): string
export function encryptToken(value: string | null): string | null
export function encryptToken(value: string | undefined): string | undefined
export function encryptToken(value: string | null | undefined): string | null | undefined
export function encryptToken(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined || value === '') return value
  if (isEncrypted(value)) return value
  const enc = encryptSecret(value)
  return `${PREFIX}${toB64url(enc.iv)}.${toB64url(enc.authTag)}.${toB64url(enc.ciphertext)}`
}

/**
 * Plaintext of a stored token. Legacy plaintext passes through. Throws when
 * an envelope fails authentication (tampered, or AUTH_SECRET changed).
 */
export function decryptToken(value: string): string
export function decryptToken(value: string | null): string | null
export function decryptToken(value: string | undefined): string | undefined
export function decryptToken(value: string | null | undefined): string | null | undefined
export function decryptToken(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined || !isEncrypted(value)) return value
  const [iv = '', authTag = '', ciphertext = ''] = value.slice(PREFIX.length).split('.')
  return decryptSecret({ iv: fromB64url(iv), authTag: fromB64url(authTag), ciphertext: fromB64url(ciphertext) })
}
