import { describe, it, expect, vi, beforeEach } from 'vitest'

// Isolated stub — always returns a valid parseJob shape. The v2 sibling test
// uses a call-counter-based mock; when both share the vi.mock module cache,
// state can bleed. Using a fresh vi.mock per test call via resetModules
// keeps them independent.

vi.mock('@google/generative-ai', () => {
  class GoogleGenerativeAI {
    getGenerativeModel() {
      return {
        generateContent: async () => ({
          response: {
            text: () =>
              JSON.stringify({
                title: 'Senior Engineer',
                company_name: 'Acme',
                tech_stack: ['php', 'laravel'],
                responsibilities: [],
                requirements: [],
                benefits: { visa_sponsorship: true },
              }),
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
          },
        }),
      }
    }
  }
  return { GoogleGenerativeAI }
})

vi.mock('@/lib/db/client', () => ({ db: { insert: () => ({ values: async () => {} }) } }))
vi.mock('@/lib/db/schema', () => ({ aiCallLogs: {} }))

beforeEach(() => {
  vi.resetModules()
})

describe('GeminiProvider.parseJob', () => {
  it('returns parsed data validated against schema', async () => {
    // Re-import after reset so we get the freshly-mocked module each run.
    const { GeminiProvider } = await import('@/lib/ai/gemini')
    const p = new GeminiProvider('key')
    const r = await p.parseJob('some jd text')
    expect(r.title).toBe('Senior Engineer')
    expect(r.tech_stack).toContain('php')
    expect(r.benefits.visa_sponsorship).toBe(true)
  })
})
