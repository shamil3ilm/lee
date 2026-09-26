import { describe, expect, it } from 'vitest'
import { parseGroqDuration, parseGroqRateLimitHeaders } from '@/lib/ai/rate-limit-headers'

describe('parseGroqDuration', () => {
  it('parses the formats Groq documents', () => {
    expect(parseGroqDuration('2m59.56s')).toBe(179_560)
    expect(parseGroqDuration('7.66s')).toBe(7_660)
    expect(parseGroqDuration('1h2m3s')).toBe(3_723_000)
    expect(parseGroqDuration('250ms')).toBe(250)
    expect(parseGroqDuration('12')).toBe(12_000)
  })

  it('returns null for missing or malformed values', () => {
    expect(parseGroqDuration(null)).toBeNull()
    expect(parseGroqDuration('')).toBeNull()
    expect(parseGroqDuration('soon')).toBeNull()
  })
})

describe('parseGroqRateLimitHeaders', () => {
  const now = new Date('2026-09-26T12:00:00Z')

  it('maps x-ratelimit-* headers to a snapshot with absolute reset times', () => {
    const h = new Headers({
      'x-ratelimit-limit-requests': '14400',
      'x-ratelimit-limit-tokens': '18000',
      'x-ratelimit-remaining-requests': '14370',
      'x-ratelimit-remaining-tokens': '17997',
      'x-ratelimit-reset-requests': '2m59.56s',
      'x-ratelimit-reset-tokens': '7.66s',
    })
    const snap = parseGroqRateLimitHeaders(h, now)
    expect(snap).toEqual({
      limitRequests: 14400,
      remainingRequests: 14370,
      resetRequestsAt: new Date(now.getTime() + 179_560),
      limitTokens: 18000,
      remainingTokens: 17997,
      resetTokensAt: new Date(now.getTime() + 7_660),
      retryAfterAt: null,
    })
  })

  it('captures retry-after (seconds) on a 429', () => {
    const h = new Headers({ 'x-ratelimit-remaining-tokens': '0', 'retry-after': '2' })
    const snap = parseGroqRateLimitHeaders(h, now)
    expect(snap?.retryAfterAt).toEqual(new Date(now.getTime() + 2_000))
    expect(snap?.remainingTokens).toBe(0)
    expect(snap?.limitRequests).toBeNull()
  })

  it('returns null when no rate-limit headers are present', () => {
    expect(parseGroqRateLimitHeaders(new Headers({ 'content-type': 'x' }), now)).toBeNull()
    expect(parseGroqRateLimitHeaders(undefined, now)).toBeNull()
  })
})
