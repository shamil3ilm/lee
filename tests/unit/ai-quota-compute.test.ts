import { describe, expect, it } from 'vitest'
import { computeQuotaStatus, quotaLevel, type LocalUsage } from '@/lib/ai/quota-compute'
import { freeTierLimitFor, QUOTA_CRITICAL, QUOTA_WARN } from '@/lib/ai/quota-limits'

const now = new Date('2026-09-26T12:00:00Z')
const ZERO: LocalUsage = {
  requestsDay: 0,
  tokensDay: 0,
  requestsMinute: 0,
  tokensMinute: 0,
  audioSecondsHour: 0,
  audioSecondsDay: 0,
}

describe('quotaLevel', () => {
  it('uses the 70% / 90% warning thresholds', () => {
    expect(QUOTA_WARN).toBe(0.7)
    expect(QUOTA_CRITICAL).toBe(0.9)
    expect(quotaLevel(0.69)).toBe('ok')
    expect(quotaLevel(0.7)).toBe('warn')
    expect(quotaLevel(0.9)).toBe('critical')
    expect(quotaLevel(1)).toBe('exhausted')
  })
})

describe('freeTierLimitFor', () => {
  it('knows the documented Groq free-plan limits', () => {
    const l = freeTierLimitFor('groq', 'openai/gpt-oss-20b')
    expect(l).toMatchObject({ rpm: 30, rpd: 1000, tpm: 8000, tpd: 200_000, approximate: false })
    expect(freeTierLimitFor('groq', 'whisper-large-v3')).toMatchObject({
      rpd: 2000,
      audioSecondsPerHour: 7200,
      audioSecondsPerDay: 28_800,
    })
  })

  it('marks Gemini limits approximate and matches flash-lite before flash', () => {
    const lite = freeTierLimitFor('gemini', 'gemini-3.6-flash-lite')
    const flash = freeTierLimitFor('gemini', 'gemini-3.6-flash')
    expect(lite?.approximate).toBe(true)
    expect(lite?.rpd).not.toBe(flash?.rpd)
    expect(flash?.dayWindow).toBe('midnight_pacific')
    expect(lite?.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns null for unknown providers or models', () => {
    expect(freeTierLimitFor('laya', 'x')).toBeNull()
    expect(freeTierLimitFor('groq', 'mystery-model')).toBeNull()
  })
})

describe('computeQuotaStatus', () => {
  const limit = freeTierLimitFor('groq', 'openai/gpt-oss-20b')

  it('estimates from local usage when there is no snapshot', () => {
    const s = computeQuotaStatus({
      provider: 'groq',
      model: 'openai/gpt-oss-20b',
      limit,
      local: { ...ZERO, requestsDay: 750, tokensDay: 20_000 },
      snapshot: null,
      now,
    })
    expect(s.level).toBe('warn')
    expect(s.fraction).toBeCloseTo(0.75)
    const rpd = s.dimensions.find((d) => d.key === 'requests_day')!
    expect(rpd).toMatchObject({ used: 750, limit: 1000, source: 'estimate' })
  })

  it('prefers a fresh provider snapshot over the estimate', () => {
    const s = computeQuotaStatus({
      provider: 'groq',
      model: 'openai/gpt-oss-20b',
      limit,
      local: { ...ZERO, requestsDay: 10 },
      snapshot: {
        limitRequests: 1000,
        remainingRequests: 50,
        resetRequestsAt: new Date(now.getTime() + 60_000),
        limitTokens: 8000,
        remainingTokens: 8000,
        resetTokensAt: new Date(now.getTime() + 1_000),
        retryAfterAt: null,
        observedAt: now,
      },
      now,
    })
    const rpd = s.dimensions.find((d) => d.key === 'requests_day')!
    expect(rpd).toMatchObject({ used: 950, limit: 1000, source: 'provider' })
    expect(s.level).toBe('critical')
  })

  it('falls back to the estimate once a snapshot window has reset, keeping the provider limit', () => {
    const s = computeQuotaStatus({
      provider: 'groq',
      model: 'openai/gpt-oss-20b',
      limit,
      local: { ...ZERO, tokensMinute: 100 },
      snapshot: {
        limitRequests: null,
        remainingRequests: null,
        resetRequestsAt: null,
        limitTokens: 250_000,
        remainingTokens: 0,
        resetTokensAt: new Date(now.getTime() - 1_000),
        retryAfterAt: null,
        observedAt: new Date(now.getTime() - 5_000),
      },
      now,
    })
    const tpm = s.dimensions.find((d) => d.key === 'tokens_minute')!
    expect(tpm).toMatchObject({ used: 100, limit: 250_000, source: 'estimate' })
    expect(s.level).toBe('ok')
  })

  it('is exhausted while a retry-after is pending', () => {
    const s = computeQuotaStatus({
      provider: 'groq',
      model: 'openai/gpt-oss-20b',
      limit,
      local: ZERO,
      snapshot: {
        limitRequests: null,
        remainingRequests: null,
        resetRequestsAt: null,
        limitTokens: null,
        remainingTokens: null,
        resetTokensAt: null,
        retryAfterAt: new Date(now.getTime() + 2_000),
        observedAt: now,
      },
      now,
    })
    expect(s.level).toBe('exhausted')
  })

  it('measures billed audio seconds against the hourly audio limit', () => {
    const s = computeQuotaStatus({
      provider: 'groq',
      model: 'whisper-large-v3',
      limit: freeTierLimitFor('groq', 'whisper-large-v3'),
      local: { ...ZERO, audioSecondsHour: 7200 },
      snapshot: null,
      now,
    })
    expect(s.dimensions.find((d) => d.key === 'audio_seconds_hour')?.fraction).toBe(1)
    expect(s.level).toBe('exhausted')
  })

  it('is unknown with no limits and no snapshot', () => {
    const s = computeQuotaStatus({
      provider: 'laya',
      model: 'x',
      limit: null,
      local: ZERO,
      snapshot: null,
      now,
    })
    expect(s.level).toBe('unknown')
    expect(s.dimensions).toEqual([])
  })
})
