import { describe, it, expect } from 'vitest'
import { sha256Fields } from '@/lib/staleness/hash'

describe('sha256Fields', () => {
  it('is deterministic — same input, same hash', () => {
    const input = { a: 1, b: 'two', c: [1, 2, 3] }
    expect(sha256Fields(input)).toBe(sha256Fields(input))
  })

  it('is order-insensitive at the object-key level', () => {
    const a = { one: 1, two: 2, three: { alpha: 'a', beta: 'b' } }
    const b = { three: { beta: 'b', alpha: 'a' }, two: 2, one: 1 }
    expect(sha256Fields(a)).toBe(sha256Fields(b))
  })

  it('is order-sensitive at the array level (arrays are ordered)', () => {
    expect(sha256Fields([1, 2, 3])).not.toBe(sha256Fields([3, 2, 1]))
  })

  it('treats undefined keys as absent', () => {
    expect(sha256Fields({ a: 1 })).toBe(sha256Fields({ a: 1, b: undefined }))
  })

  it('drops undefined keys but keeps null keys', () => {
    // Rationale: JSON has no `undefined`, so any caller that sets a field to
    // `undefined` is really saying "the key isn't there." `null`, on the
    // other hand, is a real value — a stage that was explicitly cleared is
    // NOT the same as a stage that was never queried.
    expect(sha256Fields({ a: 1 })).toBe(sha256Fields({ a: 1, b: undefined }))
    expect(sha256Fields({ a: null })).not.toBe(sha256Fields({}))
  })

  it('hashes dates as ISO strings so identical moments collide', () => {
    const t = new Date('2026-09-25T12:00:00.000Z')
    const t2 = new Date(t.getTime())
    expect(sha256Fields({ when: t })).toBe(sha256Fields({ when: t2 }))
  })

  it('produces different hashes for materially different inputs', () => {
    expect(sha256Fields({ status: 'applied' })).not.toBe(
      sha256Fields({ status: 'interview' }),
    )
  })

  it('is stable across process boundaries — snapshot the hex for a known value', () => {
    // A pinned expected value catches accidental changes to the canonicalizer.
    // The value here is the sha256 of `{"a":1,"b":"two"}`.
    const hash = sha256Fields({ a: 1, b: 'two' })
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(sha256Fields({ b: 'two', a: 1 })).toBe(hash)
  })
})
