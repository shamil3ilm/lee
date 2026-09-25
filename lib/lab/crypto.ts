import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

/**
 * v14 — at-rest encryption for user-supplied provider API keys.
 *
 * AES-256-GCM with a 32-byte key derived from AUTH_SECRET via HKDF-SHA256.
 * A fresh random 12-byte IV is used for every encryption; the GCM auth tag
 * makes any tampering with ciphertext / iv / tag fail loudly on decrypt.
 *
 * SERVER-ONLY: this module uses node:crypto and AUTH_SECRET. It must never be
 * imported from a client component. (The `server-only` package is not a
 * dependency of this project, so the guarantee is by convention: only
 * lib/db/queries/labProviderKeys.ts and lib/lab/providers/* import it.)
 */

const HKDF_SALT = 'employ-lab-salt-v1'
const HKDF_INFO = 'employ-lab-provider-keys-v1'
const ALGO = 'aes-256-gcm'
const IV_BYTES = 12

export interface EncryptedSecret {
  ciphertext: string // base64
  iv: string // base64
  authTag: string // base64
}

function readSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET is missing or too short to derive an encryption key')
  }
  return secret
}

let cached: { secret: string; key: Buffer } | null = null

function deriveKey(): Buffer {
  const secret = readSecret()
  if (cached && cached.secret === secret) return cached.key
  const key = Buffer.from(hkdfSync('sha256', secret, HKDF_SALT, HKDF_INFO, 32))
  cached = { secret, key }
  return key
}

export function encryptSecret(plain: string): EncryptedSecret {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('encryptSecret: plaintext must be a non-empty string')
  }
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, deriveKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  }
}

/** Throws when the ciphertext, IV or tag has been tampered with. */
export function decryptSecret(enc: EncryptedSecret): string {
  const iv = Buffer.from(enc.iv, 'base64')
  if (iv.length !== IV_BYTES) throw new Error('decryptSecret: invalid IV')
  const tag = Buffer.from(enc.authTag, 'base64')
  if (tag.length !== 16) throw new Error('decryptSecret: invalid auth tag')
  const decipher = createDecipheriv(ALGO, deriveKey(), iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([
    decipher.update(Buffer.from(enc.ciphertext, 'base64')),
    decipher.final(),
  ])
  return plain.toString('utf8')
}

/** Last 4 chars for masked display (`••••abcd`). Short keys reveal nothing. */
export function last4(key: string): string {
  return key.length >= 12 ? key.slice(-4) : ''
}
