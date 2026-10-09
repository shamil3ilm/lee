import { describe, expect, it } from 'vitest'
import { decryptToken, encryptToken, isEncrypted } from '@/lib/crypto/token-vault'

describe('token vault', () => {
  it('round-trips and never stores the plaintext', () => {
    const enc = encryptToken('ya29.secret-access-token')
    expect(enc).toMatch(/^enc:v1:[\w-]+\.[\w-]+\.[\w-]+$/)
    expect(enc).not.toContain('secret-access-token')
    expect(isEncrypted(enc)).toBe(true)
    expect(decryptToken(enc)).toBe('ya29.secret-access-token')
  })

  it('uses a fresh IV per value', () => {
    expect(encryptToken('same')).not.toBe(encryptToken('same'))
  })

  it('is idempotent: encrypting an envelope returns it unchanged', () => {
    const once = encryptToken('1//refresh')
    expect(encryptToken(once)).toBe(once)
  })

  it('passes legacy plaintext and empty values through decrypt', () => {
    expect(decryptToken('plain-legacy-token')).toBe('plain-legacy-token')
    expect(decryptToken(null)).toBeNull()
    expect(decryptToken(undefined)).toBeUndefined()
    expect(encryptToken(null)).toBeNull()
    expect(encryptToken('')).toBe('')
  })

  it('detects envelopes strictly', () => {
    expect(isEncrypted('enc:v1:abc')).toBe(false)
    expect(isEncrypted('enc:v1:a.b.c')).toBe(true)
    expect(isEncrypted('ya29.a0Af')).toBe(false)
    expect(isEncrypted(null)).toBe(false)
  })

  it('fails loudly on tampering', () => {
    const enc = encryptToken('token-value')
    const [head, tag, ct] = enc.split('.') as [string, string, string]
    // Change the FIRST character: the last base64url character can carry
    // padding bits only, so changing it may not change the decoded bytes.
    const flipped = (ct.startsWith('A') ? 'B' : 'A') + ct.slice(1)
    expect(() => decryptToken(`${head}.${tag}.${flipped}`)).toThrow()
  })
})
