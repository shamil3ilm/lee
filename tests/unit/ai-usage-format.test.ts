import { describe, expect, it } from 'vitest'
import { formatUsageLine, formatUsageDetails, shortModel } from '@/lib/ai/usage-format'
import type { AiUsage } from '@/lib/ai/usage-types'

const base: AiUsage = {
  callId: 'c1',
  provider: 'groq',
  model: 'llama-3.3-70b-versatile',
  inputTokens: 1240,
  outputTokens: 310,
  latencyMs: 1234,
  calls: 1,
  failedAttempts: 0,
  rateLimited: 0,
  cached: false,
  skipped: false,
}

describe('shortModel', () => {
  it('drops the vendor prefix and the -versatile suffix', () => {
    expect(shortModel('openai/gpt-oss-20b')).toBe('gpt-oss-20b')
    expect(shortModel('llama-3.3-70b-versatile')).toBe('llama-3.3-70b')
    expect(shortModel(null)).toBeNull()
  })
})

describe('formatUsageLine', () => {
  it('renders the compact tokens · model · latency line', () => {
    expect(formatUsageLine(base)).toBe('1,240 in · 310 out · llama-3.3-70b · 1.2 s')
  })

  it('uses ms under a second and omits a missing model', () => {
    expect(formatUsageLine({ ...base, model: null, latencyMs: 420 })).toBe('1,240 in · 310 out · 420 ms')
  })

  it('shows audio seconds for transcription calls', () => {
    expect(
      formatUsageLine({ ...base, inputTokens: 0, outputTokens: 0, model: 'whisper-large-v3', audioSeconds: 12.5 }),
    ).toBe('12.5 s audio · whisper-large-v3 · 1.2 s')
  })

  it('labels skipped and cached responses', () => {
    expect(formatUsageLine({ ...base, skipped: true, calls: 0 })).toBe('Skipped · no model call')
    expect(formatUsageLine({ ...base, cached: true, calls: 0 })).toBe('Cached · no model call')
  })
})

describe('formatUsageDetails', () => {
  it('lists provider, attempts, 429s and the free-tier cost note', () => {
    const lines = formatUsageDetails({ ...base, failedAttempts: 2, rateLimited: 1, calls: 1 })
    expect(lines).toContain('Provider: groq')
    expect(lines).toContain('Model: llama-3.3-70b-versatile')
    expect(lines).toContain('Retries: 2 failed attempts (1 rate-limited)')
    expect(lines.at(-1)).toBe('Estimated cost: $0 (free tier)')
  })
})
