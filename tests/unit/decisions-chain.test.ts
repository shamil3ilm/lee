import { describe, it, expect, vi, afterEach } from 'vitest'
import { z } from 'zod'
import {
  GroqDecisionProvider,
  HeuristicDecisionProvider,
  LayaHttpDecisionProvider,
  LayaUnavailableError,
  _internal,
} from '@/lib/decisions'
import type { DecisionProvider } from '@/lib/decisions/types'
import { EXPENSE_CATEGORIES } from '@/lib/expenses/categories'

const { ChainedDecisionProvider } = _internal

describe('LayaHttpDecisionProvider — network failure surfaces as LayaUnavailableError', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('throws LayaUnavailableError when the Space is unreachable', async () => {
    // Simulate fetch itself rejecting (e.g. DNS or connect refused).
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))
    const p = new LayaHttpDecisionProvider('http://laya.example', 'x')
    await expect(
      p.choice({ text: 'x', options: ['a', 'b'] as const }),
    ).rejects.toBeInstanceOf(LayaUnavailableError)
    await expect(p.yesNo({ text: 'x', question: 'y' })).rejects.toBeInstanceOf(
      LayaUnavailableError,
    )
    await expect(p.score({ text: 'x', rubric: 'y' })).rejects.toBeInstanceOf(
      LayaUnavailableError,
    )
  })
})

describe('ChainedDecisionProvider fallback', () => {
  it('falls back on error and returns first successful result', async () => {
    let choiceCalls = 0
    const failing: DecisionProvider = {
      async choice() {
        choiceCalls++
        throw new LayaUnavailableError()
      },
      async yesNo() {
        throw new Error('boom')
      },
      async score() {
        throw new Error('boom')
      },
    }
    const heuristic = new HeuristicDecisionProvider()
    const chain = new ChainedDecisionProvider([failing, heuristic])
    const res = await chain.choice({
      text: 'Netflix',
      options: EXPENSE_CATEGORIES,
    })
    expect(res.pick).toBe('subscription')
    expect(choiceCalls).toBe(1)
  })

  it('short-circuits on first success', async () => {
    const good: DecisionProvider = {
      async choice(input) {
        return { pick: input.options[0]!, confidence: 0.99 }
      },
      async yesNo() {
        return { answer: true, confidence: 0.9 }
      },
      async score() {
        return { score: 0.7 }
      },
    }
    const heuristicSpy = vi.spyOn(HeuristicDecisionProvider.prototype, 'choice')
    const chain = new ChainedDecisionProvider([good, new HeuristicDecisionProvider()])
    const res = await chain.choice({
      text: 'Netflix',
      options: EXPENSE_CATEGORIES,
    })
    expect(res.pick).toBe(EXPENSE_CATEGORIES[0])
    expect(heuristicSpy).not.toHaveBeenCalled()
    heuristicSpy.mockRestore()
  })
})

// Explicit test for the `laya` env path: laya-http fails → chain falls
// through to Groq → heuristic. Verifies the v8.1 real HTTP client still
// composes cleanly when the Space is broken/unavailable.
describe('composed provider — laya path fallback chain', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('laya network fails → groq succeeds → returns groq result', async () => {
    // Route fetch by URL: Laya endpoint rejects at the socket, Groq returns
    // a valid JSON choice.
    vi.spyOn(globalThis, 'fetch').mockImplementation((async (url: string) => {
      const u = String(url)
      if (u.includes('laya.example')) throw new Error('ECONNREFUSED')
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ pick: 'shopping', confidence: 0.8 }),
              },
            },
          ],
        }),
        { status: 200 },
      )
    }) as typeof fetch)

    const chain = new ChainedDecisionProvider([
      new LayaHttpDecisionProvider('http://laya.example'),
      new GroqDecisionProvider('test-key'),
      new HeuristicDecisionProvider(),
    ])
    const res = await chain.choice({
      text: 'noon.com order',
      options: EXPENSE_CATEGORIES,
    })
    expect(res.pick).toBe('shopping')
    expect(res.confidence).toBe(0.8)
  })

  it('laya + groq both fail → heuristic still returns a pick', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('rate-limited', { status: 429 }),
    )
    const chain = new ChainedDecisionProvider([
      new LayaHttpDecisionProvider('http://laya.example'),
      new GroqDecisionProvider('test-key'),
      new HeuristicDecisionProvider(),
    ])
    const res = await chain.choice({
      text: 'Netflix',
      options: EXPENSE_CATEGORIES,
    })
    expect(res.pick).toBe('subscription')
  })
})

// Simple sanity check that the response schema validation actually rejects
// bogus Groq payloads (defence-in-depth against a model returning garbage).
describe('GroqDecisionProvider response validation', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('throws when Groq returns a pick that is not in the options list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ pick: 'not-a-category', confidence: 0.9 }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    )
    const provider = new GroqDecisionProvider('test-key')
    await expect(
      provider.choice({
        text: 'x',
        options: ['a', 'b'] as const,
      }),
    ).rejects.toThrow(/not in options/)
  })

  it('throws when confidence is out of range', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: JSON.stringify({ pick: 'a', confidence: 5 }) },
            },
          ],
        }),
        { status: 200 },
      ),
    )
    const provider = new GroqDecisionProvider('test-key')
    // z.ZodError is thrown by the schema parse.
    await expect(
      provider.choice({ text: 'x', options: ['a', 'b'] as const }),
    ).rejects.toBeInstanceOf(z.ZodError)
  })
})
