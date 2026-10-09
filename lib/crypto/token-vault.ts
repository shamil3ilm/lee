import { decryptSecret, encryptSecret } from '@/lib/lab/crypto'

/**
 * SERVER-ONLY. At-rest encryption for third-party OAuth tokens, on the same
 * AES-256-GCM scheme as the service-key store (lib/lab/crypto.ts, key
 * derived from AUTH_SECRET). One self-describing string per value:
 *
 *   enc:v1:<iv b64>:<auth tag b64>:<ciphertext b64>
 *
 * so a column can hold it as plain text and `isEncrypted` tells an
 * encrypted value from a legacy plaintext one.
 */

const PREFIX = 'enc:v1:'

export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PREFIX) && value.split(':').length === 5
}

export function encryptToken(plain: string): string {
  const e = encryptSecret(plain)
  return `${PREFIX}${e.iv}:${e.authTag}:${e.ciphertext}`
}

/** Throws when the value is not an encrypted token or was tampered with. */
export function decryptToken(stored: string): string {
  if (!isEncrypted(stored)) throw new Error('decryptToken: not an encrypted token')
  const [, , iv, authTag, ciphertext] = stored.split(':') as [string, string, string, string, string]
  return decryptSecret({ iv, authTag, ciphertext })
}
