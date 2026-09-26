import { describe, expect, it, vi } from 'vitest'

// Gemini SDK stub: records the per-request options and plays a hung
// upstream that only settles when the request's signal aborts.
const seen: Array<{ signal?: AbortSignal }> = []
vi.mock('@google/generative-ai', () => {
  class GoogleGenerativeAI {
    getGenerativeModel() {
      return {
        generateContent: (_prompt: string, opts?: { signal?: AbortSignal }) => {
          seen.push({ signal: opts?.signal })
          const signal = opts?.signal
          if (!signal) return Promise.reject(new Error('no signal'))
          // Simulate the timeout having fired.
          return Promise.reject(
            Object.assign(new Error('Request aborted when fetching x: timeout'), {
              name: 'GoogleGenerativeAIAbortError',
              __forceAbort: true,
            }),
          )
        },
      }
    }
  }
  return { GoogleGenerativeAI }
})
vi.mock('@/lib/db/client', () => ({ db: { insert: () => ({ values: () => ({ returning: async () => [] }) }) } }))
vi.mock('@/lib/db/schema', () => ({ aiCallLogs: {} }))

import { GeminiProvider } from '@/lib/ai/gemini'
import * as timeoutMod from '@/lib/net/timeout'

describe('GeminiProvider timeouts', () => {
  it('gives every attempt its own timeout signal and surfaces a timeout as a plain Error', async () => {
    seen.length = 0
    // Make the per-attempt signal report "aborted" so the provider can tell
    // a timeout apart from any other SDK failure.
    vi.spyOn(timeoutMod, 'timeoutSignal').mockImplementation(() => AbortSignal.abort(new DOMException('t', 'TimeoutError')))
    const p = new GeminiProvider('k', 'gemini-a')
    const err = await p.parseJob('job text').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/^gemini timed out after \d+ms$/)
    // Timeouts are not retried with backoff; the fallback model gets one try.
    expect(seen).toHaveLength(2)
    expect(seen.every((s) => s.signal instanceof AbortSignal)).toBe(true)
  })
})
