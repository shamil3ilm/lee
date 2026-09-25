import { describe, it, expect } from 'vitest'
import { decryptSecret, encryptSecret, last4 } from '@/lib/lab/crypto'

const SECRET = 'gsk_test_1234567890abcdefghijklmnop'

function flipFirstByte(b64: string): string {
  const buf = Buffer.from(b64, 'base64')
  buf[0] = (buf[0] ?? 0) ^ 0xff
  return buf.toString('base64')
}

describe('lab crypto', () => {
  it('round-trips a secret', () => {
    const enc = encryptSecret(SECRET)
    expect(decryptSecret(enc)).toBe(SECRET)
  })

  it('never stores the plaintext in the ciphertext envelope', () => {
    const enc = encryptSecret(SECRET)
    const blob = JSON.stringify(enc)
    expect(blob).not.toContain(SECRET)
    expect(blob).not.toContain(Buffer.from(SECRET).toString('base64'))
  })

  it('uses a different IV (and ciphertext) every time', () => {
    const a = encryptSecret(SECRET)
    const b = encryptSecret(SECRET)
    expect(a.iv).not.toBe(b.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)
    expect(Buffer.from(a.iv, 'base64')).toHaveLength(12)
  })

  it('throws when the ciphertext is tampered with', () => {
    const enc = encryptSecret(SECRET)
    expect(() => decryptSecret({ ...enc, ciphertext: flipFirstByte(enc.ciphertext) })).toThrow()
  })

  it('throws when the auth tag is tampered with', () => {
    const enc = encryptSecret(SECRET)
    expect(() => decryptSecret({ ...enc, authTag: flipFirstByte(enc.authTag) })).toThrow()
  })

  it('throws when the IV is swapped', () => {
    const a = encryptSecret(SECRET)
    const b = encryptSecret(SECRET)
    expect(() => decryptSecret({ ...a, iv: b.iv })).toThrow()
  })

  it('rejects an empty plaintext', () => {
    expect(() => encryptSecret('')).toThrow()
  })

  it('last4 only reveals the tail of long keys', () => {
    expect(last4(SECRET)).toBe('mnop')
    expect(last4('short')).toBe('')
  })
})
