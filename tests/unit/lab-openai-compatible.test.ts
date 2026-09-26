import { describe, it, expect, vi } from 'vitest'
import {
  buildBody,
  chat,
  computeMetrics,
  fetchModels,
  parseSse,
  type Endpoint,
} from '@/lib/lab/providers/openai-compatible'
import { ProviderError, RateLimitedError, redactSecrets } from '@/lib/lab/providers/errors'

const KEY = 'gsk_supersecretkey_1234567890'
const ep: Endpoint = { provider: 'groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: KEY }

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function sseResponse(lines: string[]): Response {
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const l of lines) c.enqueue(enc.encode(l))
      c.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

/** Deterministic clock: each call advances by the next step. */
function clock(steps: number[]): () => number {
  let t = 0
  let i = 0
  return () => {
    const v = t
    t += steps[i++] ?? 0
    return v
  }
}

describe('buildBody', () => {
  it('prepends system prompt and sets params', () => {
    const b = buildBody('m', { system: 'sys', messages: [{ role: 'user', content: 'hi' }], temperature: 0.3, maxTokens: 50 }, false)
    expect(b.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ])
    expect(b.temperature).toBe(0.3)
    expect(b.max_tokens).toBe(50)
    expect(b.response_format).toBeUndefined()
    expect(b.stream_options).toBeUndefined()
  })

  it('JSON-schema mode adds json_object + schema instruction; streaming asks for usage', () => {
    const b = buildBody('m', { messages: [{ role: 'user', content: 'hi' }], jsonSchema: { type: 'object' } }, true)
    expect(b.response_format).toEqual({ type: 'json_object' })
    expect(b.stream_options).toEqual({ include_usage: true })
    const sys = (b.messages as { role: string; content: string }[])[0]
    expect(sys?.role).toBe('system')
    expect(sys?.content).toContain('{"type":"object"}')
  })
})

describe('chat (non-streaming)', () => {
  it('returns text, usage tokens and latency; sends bearer auth', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: 'hello' } }],
        usage: { prompt_tokens: 12, completion_tokens: 40 },
      }),
    )
    const r = await chat(ep, 'openai/gpt-oss-20b', { messages: [{ role: 'user', content: 'hi' }] }, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: clock([500]),
    })
    expect(r.text).toBe('hello')
    expect(r.metrics).toMatchObject({ totalMs: 500, inputTokens: 12, outputTokens: 40, tokensPerSec: 80 })
    expect(r.metrics.ttftMs).toBeUndefined()
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`)
  })

  it('maps 429 to RateLimitedError with retry-after, no retry', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { message: 'Rate limit reached' } }, { status: 429, headers: { 'retry-after': '7' } }),
    )
    const err = await chat(ep, 'm', { messages: [{ role: 'user', content: 'x' }] }, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RateLimitedError)
    expect((err as RateLimitedError).retryAfterSec).toBe(7)
    expect((err as Error).message).toMatch(/Rate limited by groq/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('maps 401 to an auth ProviderError and 5xx without retries', async () => {
    const f401 = vi.fn(async () => jsonResponse({ error: { message: `Invalid key ${KEY}` } }, { status: 401 }))
    const e1 = await chat(ep, 'm', { messages: [{ role: 'user', content: 'x' }] }, {
      fetchImpl: f401 as unknown as typeof fetch,
    }).catch((e: unknown) => e)
    expect(e1).toBeInstanceOf(ProviderError)
    expect((e1 as ProviderError).code).toBe('auth')
    expect((e1 as Error).message).not.toContain(KEY)

    const f503 = vi.fn(async () => new Response('upstream down', { status: 503 }))
    const e2 = await chat(ep, 'm', { messages: [{ role: 'user', content: 'x' }] }, {
      fetchImpl: f503 as unknown as typeof fetch,
    }).catch((e: unknown) => e)
    expect((e2 as ProviderError).status).toBe(503)
    expect(f503).toHaveBeenCalledTimes(1)
  })

  it('400 includes the provider message but redacts the key', async () => {
    const f = vi.fn(async () =>
      jsonResponse({ error: { message: `model not found (key ${KEY})` } }, { status: 400 }),
    )
    const e = (await chat(ep, 'm', { messages: [{ role: 'user', content: 'x' }] }, {
      fetchImpl: f as unknown as typeof fetch,
    }).catch((x: unknown) => x)) as ProviderError
    expect(e.message).toContain('model not found')
    expect(e.message).not.toContain(KEY)
  })

  it('retries exactly once on a network error', async () => {
    const f = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'ok' } }] }))
    const r = await chat(ep, 'm', { messages: [{ role: 'user', content: 'x' }] }, {
      fetchImpl: f as unknown as typeof fetch,
    })
    expect(r.text).toBe('ok')
    expect(f).toHaveBeenCalledTimes(2)

    const g = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    const e = await chat(ep, 'm', { messages: [{ role: 'user', content: 'x' }] }, {
      fetchImpl: g as unknown as typeof fetch,
    }).catch((x: unknown) => x)
    expect((e as ProviderError).code).toBe('network')
    expect(g).toHaveBeenCalledTimes(2)
  })
})

describe('chat (streaming)', () => {
  it('parses SSE deltas, measures TTFT and reads usage from the final chunk', async () => {
    const f = vi.fn(async () =>
      sseResponse([
        ': OPENROUTER PROCESSING\n\n',
        'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\ndata: {"choices":[{"delta":{"con',
        'tent":"lo"}}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":20}}\n\n',
        'data: [DONE]\n\n',
      ]),
    )
    const deltas: string[] = []
    // start=0, first token at 100, end at 1100
    const r = await chat(ep, 'm', { messages: [{ role: 'user', content: 'x' }] }, {
      stream: true,
      fetchImpl: f as unknown as typeof fetch,
      onDelta: (t) => deltas.push(t),
      now: clock([100, 1000]),
    })
    expect(r.text).toBe('Hello')
    expect(deltas).toEqual(['Hel', 'lo'])
    expect(r.metrics).toMatchObject({ ttftMs: 100, totalMs: 1100, inputTokens: 5, outputTokens: 20, tokensPerSec: 20 })
  })

  it('reads Groq x_groq.usage', async () => {
    const f = vi.fn(async () =>
      sseResponse([
        'data: {"choices":[{"delta":{"content":"a"}}]}\n\n',
        'data: {"choices":[{"delta":{}}],"x_groq":{"usage":{"prompt_tokens":3,"completion_tokens":9}}}\n\n',
        'data: [DONE]\n\n',
      ]),
    )
    const r = await chat(ep, 'm', { messages: [{ role: 'user', content: 'x' }] }, {
      stream: true,
      fetchImpl: f as unknown as typeof fetch,
    })
    expect(r.metrics.outputTokens).toBe(9)
    expect(r.metrics.inputTokens).toBe(3)
  })

  it('resends once without stream_options when a backend rejects it (400)', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'unknown field stream_options' } }), { status: 400 }))
      .mockResolvedValueOnce(sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n', 'data: [DONE]\n\n']))
    const r = await chat(ep, 'm', { messages: [{ role: 'user', content: 'x' }] }, {
      stream: true,
      fetchImpl: f as unknown as typeof fetch,
    })
    expect(r.text).toBe('ok')
    expect(f).toHaveBeenCalledTimes(2)
    const second = JSON.parse(String((f.mock.calls[1]?.[1] as RequestInit).body)) as Record<string, unknown>
    expect(second.stream_options).toBeUndefined()
    expect(second.stream).toBe(true)
  })

  it('surfaces a mid-stream rate-limit error', async () => {
    const f = vi.fn(async () =>
      sseResponse(['data: {"error":{"message":"Rate limit exceeded"}}\n\n']),
    )
    await expect(
      chat(ep, 'm', { messages: [{ role: 'user', content: 'x' }] }, {
        stream: true,
        fetchImpl: f as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(RateLimitedError)
  })
})

describe('parseSse', () => {
  it('ignores comments and malformed lines, stops at [DONE]', async () => {
    const res = sseResponse([': ping\n', 'data: {"a":1}\r\n', 'data: nope\n', 'data: [DONE]\n', 'data: {"b":2}\n'])
    const out: unknown[] = []
    for await (const x of parseSse(res.body as ReadableStream<Uint8Array>)) out.push(x)
    expect(out).toEqual([{ a: 1 }])
  })
})

describe('computeMetrics', () => {
  it('leaves tokens/sec undefined when usage is missing', () => {
    expect(computeMetrics({ start: 0, end: 1000 })).toEqual({
      totalMs: 1000,
      ttftMs: undefined,
      inputTokens: undefined,
      outputTokens: undefined,
      tokensPerSec: undefined,
    })
  })
})

describe('fetchModels', () => {
  it('GETs {base}/models with auth and extra headers', async () => {
    const f = vi.fn(async () => jsonResponse({ data: [{ id: 'x' }] }))
    const json = await fetchModels(
      { ...ep, provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', extraHeaders: { 'X-Title': 'lee' } },
      { fetchImpl: f as unknown as typeof fetch },
    )
    expect(json).toEqual({ data: [{ id: 'x' }] })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://openrouter.ai/api/v1/models')
    expect((init.headers as Record<string, string>)['X-Title']).toBe('lee')
    expect(init.method).toBe('GET')
  })
})

describe('redactSecrets', () => {
  it('redacts known and key-shaped secrets and truncates', () => {
    expect(redactSecrets(`bad key ${KEY}`, [KEY])).toBe('bad key [redacted]')
    expect(redactSecrets('Bearer abc.def')).toBe('[redacted]')
    expect(redactSecrets('AIzaSyA1234567890abcdefghijklmnop')).toBe('[redacted]')
    expect(redactSecrets('x'.repeat(300)).length).toBeLessThanOrEqual(201)
  })
})
