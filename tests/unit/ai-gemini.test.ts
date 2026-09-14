import { describe, it, expect, vi } from 'vitest'
import { GeminiProvider } from '@/lib/ai/gemini'

vi.mock('@google/generative-ai', () => {
  class GoogleGenerativeAI {
    getGenerativeModel() {
      return {
        generateContent: async () => ({
          response: {
            text: () => JSON.stringify({
              title: 'Senior Engineer', company_name: 'Acme',
              tech_stack: ['php', 'laravel'], responsibilities: [], requirements: [],
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

describe('GeminiProvider.parseJob', () => {
  it('returns parsed data validated against schema', async () => {
    const p = new GeminiProvider('key')
    const r = await p.parseJob('some jd text')
    expect(r.title).toBe('Senior Engineer')
    expect(r.tech_stack).toContain('php')
    expect(r.benefits.visa_sponsorship).toBe(true)
  })
})
