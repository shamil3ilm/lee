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

describe('LayaHttpDecisionProvider stub', () => {
  it('throws LayaUnavailableError from every method', async () => {
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

// Explicit test for the `laya` env path: laya-http throws → chain falls
// through to Groq → heuristic. This verifies v8.1 will slot in cleanly by
// simulating a laya provider that always throws.
describe('composed provider — laya path fallback chain', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('laya throws → groq succeeds → returns groq result', async () => {
    // Simulate Groq returning a valid JSON choice.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
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
      ),
    )
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
    // Fetch was called exactly once — by Groq — because laya throws
    // synchronously before touching the network.
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1)
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
