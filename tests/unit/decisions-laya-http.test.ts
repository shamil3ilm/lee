import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  LayaHttpDecisionProvider,
  LayaUnavailableError,
  HeuristicDecisionProvider,
  GroqDecisionProvider,
  _internal,
} from '@/lib/decisions'
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@/lib/expenses/categories'

const { ChainedDecisionProvider } = _internal

// Build a Gradio 6 SSE response body for the two-step call pattern.
// Payload shape: [rows_dataframe, raw_json_string].
function sseFrame(rawJsonPayload: unknown): string {
  const payload = JSON.stringify([
    { headers: ['q', 'pick'], data: [] },
    JSON.stringify(rawJsonPayload),
  ])
  return `event: complete\ndata: ${payload}\n\n`
}

interface MockCall {
  method: string
  url: string
  headers?: Record<string, string>
  body?: string
}

function mockGradio(rawJsonPayload: unknown, opts?: { eventId?: string }) {
  const calls: MockCall[] = []
  const eventId = opts?.eventId ?? 'evt-123'
  return {
    calls,
    fetch: vi.fn(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      const headers = init?.headers as Record<string, string> | undefined
      const body = typeof init?.body === 'string' ? init.body : undefined
      calls.push({ method, url, headers, body })
      if (method === 'POST') {
        return new Response(JSON.stringify({ event_id: eventId }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(sseFrame(rawJsonPayload), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }),
  }
}

describe('LayaHttpDecisionProvider.choice', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('parses the REAL Laya response shape (choice + probabilities map)', async () => {
    // Verified via curl against the live demo Space on 2026-09-25.
    // Laya returns `choice` (not `pick`) and a `probabilities` map keyed by option.
    const mock = mockGradio({
      model: 'laya',
      answers: {
        answer: {
          type: 'choice',
          choice: 'subscription',
          probabilities: { subscription: 0.978, food: 0.008, other: 0.014 },
          confidence: 0.891,
        },
      },
      usage: { input_tokens: 29, output_tokens: 0 },
      latency_ms: 86.8,
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(mock.fetch as typeof fetch)

    const provider = new LayaHttpDecisionProvider('http://laya.example')
    const res = await provider.choice<ExpenseCategory>({
      text: 'Netflix monthly bill',
      options: EXPENSE_CATEGORIES,
    })

    expect(res.pick).toBe('subscription')
    // Prefer probabilities[pick] over the aggregate confidence.
    expect(res.confidence).toBeCloseTo(0.978)
  })

  it('returns pick + confidence for a legacy Gradio SSE response (pick field)', async () => {
    const mock = mockGradio({
      answers: {
        answer: { pick: 'subscription', probability: 0.92 },
      },
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(mock.fetch as typeof fetch)

    const provider = new LayaHttpDecisionProvider('http://laya.example')
    const res = await provider.choice<ExpenseCategory>({
      text: 'Netflix monthly bill',
      options: EXPENSE_CATEGORIES,
    })

    expect(res.pick).toBe('subscription')
    expect(res.confidence).toBeCloseTo(0.92)
    // Two-step: POST + GET
    expect(mock.calls).toHaveLength(2)
    expect(mock.calls[0]!.method).toBe('POST')
    expect(mock.calls[0]!.url).toContain('/gradio_api/call/run_playground')
    expect(mock.calls[1]!.method).toBe('GET')
    expect(mock.calls[1]!.url).toContain('/gradio_api/call/run_playground/evt-123')

    // POST body must be { data: [state_text, questions_json] }
    const body = JSON.parse(mock.calls[0]!.body!)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data[0]).toBe('Netflix monthly bill')
    const questions = JSON.parse(body.data[1])
    expect(questions.answer.type).toBe('choice')
    expect(questions.answer.criteria.subscription).toBeTruthy()
  })

  it('accepts a flat { answer: {...} } response shape', async () => {
    const mock = mockGradio({ answer: { pick: 'food', confidence: 0.6 } })
    vi.spyOn(globalThis, 'fetch').mockImplementation(mock.fetch as typeof fetch)

    const provider = new LayaHttpDecisionProvider('http://laya.example')
    const res = await provider.choice<ExpenseCategory>({
      text: 'lunch',
      options: EXPENSE_CATEGORIES,
    })
    expect(res.pick).toBe('food')
    expect(res.confidence).toBeCloseTo(0.6)
  })

  it('throws LayaUnavailableError when pick is not in options', async () => {
    const mock = mockGradio({
      answers: { answer: { pick: 'not-a-category', probability: 0.99 } },
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(mock.fetch as typeof fetch)

    const provider = new LayaHttpDecisionProvider('http://laya.example')
    await expect(
      provider.choice({ text: 'x', options: ['a', 'b'] as const }),
    ).rejects.toBeInstanceOf(LayaUnavailableError)
  })

  it('throws LayaUnavailableError for malformed SSE response', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (async (_url: string, init?: RequestInit) => {
        if ((init?.method ?? 'GET') === 'POST') {
          return new Response(JSON.stringify({ event_id: 'e' }), { status: 200 })
        }
        return new Response('this is not sse at all', { status: 200 })
      }) as typeof fetch,
    )

    const provider = new LayaHttpDecisionProvider('http://laya.example')
    await expect(
      provider.choice({ text: 'x', options: ['a', 'b'] as const }),
    ).rejects.toBeInstanceOf(LayaUnavailableError)
  })

  it('throws LayaUnavailableError on POST 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('boom', { status: 500 }),
    )
    const provider = new LayaHttpDecisionProvider('http://laya.example')
    await expect(
      provider.choice({ text: 'x', options: ['a'] as const }),
    ).rejects.toBeInstanceOf(LayaUnavailableError)
  })

  it('sends the Authorization header when apiKey is set', async () => {
    const mock = mockGradio({ answers: { answer: { pick: 'a', probability: 0.5 } } })
    vi.spyOn(globalThis, 'fetch').mockImplementation(mock.fetch as typeof fetch)

    const provider = new LayaHttpDecisionProvider(
      'http://laya.example',
      'secret-token',
    )
    await provider.choice({ text: 'x', options: ['a', 'b'] as const })

    for (const call of mock.calls) {
      expect(call.headers?.authorization).toBe('Bearer secret-token')
    }
  })

  it('does NOT send Authorization header when apiKey is unset', async () => {
    const mock = mockGradio({ answers: { answer: { pick: 'a', probability: 0.5 } } })
    vi.spyOn(globalThis, 'fetch').mockImplementation(mock.fetch as typeof fetch)

    const provider = new LayaHttpDecisionProvider('http://laya.example')
    await provider.choice({ text: 'x', options: ['a', 'b'] as const })

    for (const call of mock.calls) {
      expect(call.headers?.authorization).toBeUndefined()
    }
  })

  it('defaults to the public demo endpoint when none passed', async () => {
    const mock = mockGradio({ answers: { answer: { pick: 'a', probability: 0.5 } } })
    vi.spyOn(globalThis, 'fetch').mockImplementation(mock.fetch as typeof fetch)

    const provider = new LayaHttpDecisionProvider()
    await provider.choice({ text: 'x', options: ['a', 'b'] as const })

    expect(mock.calls[0]!.url.startsWith('https://convaiinnovations-laya-demo.hf.space')).toBe(true)
  })

  it('strips trailing slash from endpoint', async () => {
    const mock = mockGradio({ answers: { answer: { pick: 'a', probability: 0.5 } } })
    vi.spyOn(globalThis, 'fetch').mockImplementation(mock.fetch as typeof fetch)

    const provider = new LayaHttpDecisionProvider('http://laya.example/')
    await provider.choice({ text: 'x', options: ['a', 'b'] as const })

    expect(mock.calls[0]!.url).toBe('http://laya.example/gradio_api/call/run_playground')
  })
})

describe('LayaHttpDecisionProvider.yesNo', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('returns true when probability >= 0.5', async () => {
    const mock = mockGradio({ answers: { answer: { probability: 0.8 } } })
    vi.spyOn(globalThis, 'fetch').mockImplementation(mock.fetch as typeof fetch)

    const provider = new LayaHttpDecisionProvider('http://laya.example')
    const res = await provider.yesNo({ text: 'x', question: 'is it?' })
    expect(res.answer).toBe(true)
    // confidence = |0.8 - 0.5| * 2 = 0.6
    expect(res.confidence).toBeCloseTo(0.6)
  })

  it('returns false when probability < 0.5', async () => {
    const mock = mockGradio({ answers: { answer: { probability: 0.2 } } })
    vi.spyOn(globalThis, 'fetch').mockImplementation(mock.fetch as typeof fetch)

    const provider = new LayaHttpDecisionProvider('http://laya.example')
    const res = await provider.yesNo({ text: 'x', question: 'is it?' })
    expect(res.answer).toBe(false)
    expect(res.confidence).toBeCloseTo(0.6)
  })

  it('reads the Jev-compatible `noul` field as the probability of true', async () => {
    // Wire format per docs.typesafe.ai/api: noul answers return { noul: 0–1 }.
    const mock = mockGradio({ answers: { answer: { type: 'noul', noul: 0.91 } } })
    vi.spyOn(globalThis, 'fetch').mockImplementation(mock.fetch as typeof fetch)

    const provider = new LayaHttpDecisionProvider('http://laya.example')
    const res = await provider.yesNo({ text: 'x', question: 'is it?' })
    expect(res.answer).toBe(true)
    expect(res.confidence).toBeCloseTo(0.82)
  })

  it('does not treat `confidence` as the probability of true', async () => {
    // A high confidence alone must not flip the answer to "yes".
    const mock = mockGradio({ answers: { answer: { confidence: 0.95 } } })
    vi.spyOn(globalThis, 'fetch').mockImplementation(mock.fetch as typeof fetch)

    const provider = new LayaHttpDecisionProvider('http://laya.example')
    const res = await provider.yesNo({ text: 'x', question: 'is it?' })
    expect(res.answer).toBe(true) // falls back to neutral 0.5 → true at the >= 0.5 boundary
    expect(res.confidence).toBeCloseTo(0)
  })
})

describe('LayaHttpDecisionProvider.score', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('returns numeric score from Laya', async () => {
    const mock = mockGradio({ answers: { answer: { value: 3 } } })
    vi.spyOn(globalThis, 'fetch').mockImplementation(mock.fetch as typeof fetch)

    const provider = new LayaHttpDecisionProvider('http://laya.example')
    const res = await provider.score({ text: 'x', rubric: 'y', scale: [0, 5] })
    expect(res.score).toBe(3)
  })
})

describe('ChainedDecisionProvider — Laya failure falls through to Groq', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('Laya malformed response → Groq succeeds → returns Groq pick', async () => {
    let postCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((async (url: string, init?: RequestInit) => {
      const u = String(url)
      const method = (init?.method ?? 'GET').toUpperCase()
      // Groq endpoint check first.
      if (u.includes('api.groq.com')) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({ pick: 'subscription', confidence: 0.77 }),
                },
              },
            ],
          }),
          { status: 200 },
        )
      }
      // Laya path: POST returns event_id, GET returns broken payload.
      if (method === 'POST') {
        postCount++
        return new Response(JSON.stringify({ event_id: 'e' }), { status: 200 })
      }
      return new Response('not sse', { status: 200 })
    }) as typeof fetch)

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
    expect(res.confidence).toBe(0.77)
    // Confirm Laya was actually attempted (didn't get skipped).
    expect(postCount).toBe(1)
  })
})

describe('LayaHttpDecisionProvider — answer_confidence', () => {
  afterEach(() => vi.restoreAllMocks())

  it('prefers answer_confidence (P of the reported answer) over entropy-based confidence', async () => {
    const mock = mockGradio({
      answers: { answer: { choice: 'a', answer_confidence: 0.64, confidence: 0.1 } },
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(mock.fetch as typeof fetch)
    const provider = new LayaHttpDecisionProvider('http://laya.example')
    const res = await provider.choice({ text: 'x', options: ['a', 'b'] as const })
    expect(res.confidence).toBeCloseTo(0.64)
  })
})
