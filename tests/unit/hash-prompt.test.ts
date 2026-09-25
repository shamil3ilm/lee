import { describe, it, expect } from 'vitest'
import { hashPrompt } from '@/lib/ai/prompts/hash'

describe('hashPrompt', () => {
  it('is deterministic — same input yields same output', () => {
    const a = hashPrompt('the quick brown fox')
    const b = hashPrompt('the quick brown fox')
    expect(a).toBe(b)
  })

  it('returns exactly 12 hex chars', () => {
    const h = hashPrompt('anything')
    expect(h).toMatch(/^[a-f0-9]{12}$/)
  })

  it('has good avalanche — a one-char change produces a very different hash', () => {
    // A one-char change should flip roughly half the hex chars. We only need
    // to prove they differ — the sha256 itself carries the guarantee — so
    // this test is a smoke check that we're truly hashing rather than doing
    // string-first-N tricks.
    const a = hashPrompt('The quick brown fox jumps over the lazy dog')
    const b = hashPrompt('The quick brown fox jumps over the lazy dof')
    expect(a).not.toBe(b)
    let differing = 0
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) differing += 1
    }
    // Very loose bound — a true sha256 avalanche will give ~6/12 diffs; even
    // 3 is enough to prove the hash sees every byte.
    expect(differing).toBeGreaterThanOrEqual(3)
  })

  it('handles empty and unicode inputs without throwing', () => {
    expect(() => hashPrompt('')).not.toThrow()
    expect(() => hashPrompt('café ☕ 世界')).not.toThrow()
    expect(hashPrompt('')).toMatch(/^[a-f0-9]{12}$/)
    expect(hashPrompt('café ☕ 世界')).toMatch(/^[a-f0-9]{12}$/)
  })
})
