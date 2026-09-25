import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { makeUser } from '@/tests/factories'
import { db } from '@/lib/db/client'
import { aiCallLogs } from '@/lib/db/schema'
import * as keysQ from '@/lib/db/queries/labProviderKeys'
import type { RunView } from '@/lib/lab/views'

const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ auth: authMock }))

// isolate:false shares the module cache across files; drop route/helper
// modules bound to another file's auth mock.
beforeAll(() => {
  vi.resetModules()
})

const GROQ_KEY = 'gsk_arena_secret_key_0000000000'
const OR_KEY = 'sk-or-v1-arena-secret-key-1111111111'

/** Fake provider backend keyed on the requested model id. */
function providerFetch() {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    if (u.endsWith('/models')) {
      return new Response(JSON.stringify({ data: [{ id: 'm' }] }), { status: 200 })
    }
    const body = JSON.parse(String(init?.body ?? '{}')) as { model: string; stream?: boolean }
    if (body.model === 'limited') {
      return new Response(JSON.stringify({ error: { message: `quota for ${OR_KEY}` } }), {
        status: 429,
      })
    }
    const content =
      body.model === 'json-good'
        ? '{"name":"Ada","years":5}'
        : body.model === 'json-bad'
          ? '{"name":42}'
          : `reply ${body.model.toUpperCase()}`
    if (body.stream) {
      const enc = new TextEncoder()
      const half = Math.ceil(content.length / 2)
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(0, half) } }] })}\n\n`))
          c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(half) } }] })}\n\n`))
          c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 4, completion_tokens: 6 } })}\n\n`))
          c.enqueue(enc.encode('data: [DONE]\n\n'))
          c.close()
        },
      })
      return new Response(stream, { status: 200 })
    }
    return new Response(
      JSON.stringify({
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 4, completion_tokens: 6 },
      }),
      { status: 200 },
    )
  })
}

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function runRoute() {
  return import('@/app/api/lab/arena/run/route')
}

let fetchMock: ReturnType<typeof providerFetch>
const savedGroq = process.env.GROQ_API_KEY

beforeEach(() => {
  authMock.mockReset()
  fetchMock = providerFetch()
  vi.stubGlobal('fetch', fetchMock)
  delete process.env.GROQ_API_KEY
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (savedGroq === undefined) delete process.env.GROQ_API_KEY
  else process.env.GROQ_API_KEY = savedGroq
})

async function signedInWithKeys() {
  const u = await makeUser()
  authMock.mockResolvedValue({ user: { id: u.id } })
  await keysQ.upsert(u.id, 'groq', GROQ_KEY)
  await keysQ.upsert(u.id, 'openrouter', OR_KEY)
  return u
}

describe('POST /api/lab/arena/run', () => {
  it('401 without a session', async () => {
    authMock.mockResolvedValue(null)
    const { POST } = await runRoute()
    const res = await POST(post('http://l/api/lab/arena/run', { prompt: 'x', models: [] }))
    expect(res.status).toBe(401)
  })

  it('400 on invalid JSON, too few models, browser providers and duplicates', async () => {
    await signedInWithKeys()
    const { POST } = await runRoute()
    expect((await POST(post('http://l', 'nope'))).status).toBe(400)
    expect(
      (await POST(post('http://l', { prompt: 'x', models: [{ provider: 'groq', model: 'a' }] }))).status,
    ).toBe(400)
    const browser = await POST(
      post('http://l', {
        prompt: 'x',
        models: [
          { provider: 'groq', model: 'a' },
          { provider: 'webllm', model: 'b' },
        ],
      }),
    )
    expect(browser.status).toBe(400)
    expect(((await browser.json()) as { error: string }).error).toMatch(/not available/)
    const dup = await POST(
      post('http://l', {
        prompt: 'x',
        models: [
          { provider: 'groq', model: 'a' },
          { provider: 'groq', model: 'a' },
        ],
      }),
    )
    expect(dup.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('runs models in parallel; one rate-limited result does not fail the run; logs every call', async () => {
    const u = await signedInWithKeys()
    const { POST } = await runRoute()
    const res = await POST(
      post('http://l', {
        system: 'be brief',
        prompt: 'hello',
        models: [
          { provider: 'groq', model: 'good-a' },
          { provider: 'openrouter', model: 'limited' },
          { provider: 'cerebras', model: 'no-key' },
        ],
      }),
    )
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain(GROQ_KEY)
    expect(text).not.toContain(OR_KEY)
    const { run } = JSON.parse(text) as { run: RunView }
    expect(run.results).toHaveLength(3)
    const byModel = Object.fromEntries(run.results.map((r) => [r.model, r]))
    expect(byModel['good-a']?.output).toBe('reply GOOD-A')
    expect(byModel['good-a']?.metrics?.outputTokens).toBe(6)
    expect(byModel['limited']?.error).toMatch(/Rate limited/)
    expect(byModel['limited']?.metrics?.errorKind).toBe('rate_limited')
    expect(byModel['no-key']?.error).toMatch(/Settings › AI/)
    expect(byModel['no-key']?.metrics?.errorKind).toBe('missing_key')

    const logs = await db.select().from(aiCallLogs).where(eq(aiCallLogs.userId, u.id))
    expect(logs).toHaveLength(3)
    expect(new Set(logs.map((l) => l.kind))).toEqual(new Set(['lab_arena']))
    expect(logs.map((l) => l.status).sort()).toEqual(['error', 'ok', 'rate_limited'])
    const ok = logs.find((l) => l.status === 'ok')
    expect(ok).toMatchObject({ provider: 'groq', model: 'good-a', completionTokens: 6 })
    expect(ok?.promptHash).toMatch(/^[0-9a-f]{12}$/)
    expect(JSON.stringify(logs)).not.toContain(OR_KEY)
  })

  it('validates outputs against a JSON schema', async () => {
    await signedInWithKeys()
    const { POST } = await runRoute()
    const res = await POST(
      post('http://l', {
        prompt: 'profile',
        jsonSchema: { type: 'object', required: ['name', 'years'], properties: { name: { type: 'string' } } },
        models: [
          { provider: 'groq', model: 'json-good' },
          { provider: 'groq', model: 'json-bad' },
        ],
      }),
    )
    const { run } = (await res.json()) as { run: RunView }
    const byModel = Object.fromEntries(run.results.map((r) => [r.model, r]))
    expect(byModel['json-good']).toMatchObject({ schemaValid: true, outputJson: { name: 'Ada', years: 5 } })
    expect(byModel['json-bad']?.schemaValid).toBe(false)
    expect(byModel['json-bad']?.metrics?.schemaErrors?.join(' ')).toMatch(/years: required/)
    const sent = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as {
      response_format?: unknown
    }
    expect(sent.response_format).toEqual({ type: 'json_object' })
  })

  it('streams SSE events when stream=true', async () => {
    await signedInWithKeys()
    const { POST } = await runRoute()
    const res = await POST(
      post('http://l', {
        prompt: 'hello',
        stream: true,
        models: [
          { provider: 'groq', model: 'good-a' },
          { provider: 'groq', model: 'good-b' },
        ],
      }),
    )
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/)
    const text = await res.text()
    expect(text).not.toContain(GROQ_KEY)
    const events = text
      .split('\n\n')
      .filter(Boolean)
      .map((block) => JSON.parse(block.split('\n').find((l) => l.startsWith('data: '))!.slice(6)) as { type: string })
    const types = events.map((e) => e.type)
    expect(types[0]).toBe('start')
    expect(types.at(-1)).toBe('done')
    expect(types.filter((t) => t === 'delta').length).toBeGreaterThanOrEqual(4)
    expect(types.filter((t) => t === 'result')).toHaveLength(2)
    const done = events.at(-1) as unknown as { run: RunView }
    expect(done.run.results.every((r) => r.metrics?.ttftMs !== undefined)).toBe(true)
  })
})

describe('blind mode + vote', () => {
  it('hides identities until vote, then reveals; enforces ownership', async () => {
    const u = await signedInWithKeys()
    const { POST } = await runRoute()
    const res = await POST(
      post('http://l', {
        prompt: 'hello',
        blind: true,
        models: [
          { provider: 'groq', model: 'good-a' },
          { provider: 'openrouter', model: 'good-b' },
        ],
      }),
    )
    const { run } = (await res.json()) as { run: RunView }
    expect(run.blind).toBe(true)
    expect(run.revealed).toBe(false)
    expect(run.config.models).toEqual([])
    expect(run.results.map((r) => r.label).sort()).toEqual(['A', 'B'])
    expect(run.results.every((r) => r.provider === null && r.model === null)).toBe(true)
    expect(JSON.stringify(run)).not.toMatch(/good-a|good-b/)

    const { GET } = await import('@/app/api/lab/runs/[id]/route')
    const before = (await (
      await GET(new Request('http://l'), { params: Promise.resolve({ id: run.id }) })
    ).json()) as { run: RunView }
    expect(JSON.stringify(before.run)).not.toMatch(/good-a|good-b/)

    const winner = run.results[0]!
    const vote = await import('@/app/api/lab/arena/[runId]/vote/route')
    // another user cannot vote on this run
    const other = await makeUser()
    authMock.mockResolvedValue({ user: { id: other.id } })
    const denied = await vote.POST(post('http://l', { resultId: winner.id }), {
      params: Promise.resolve({ runId: run.id }),
    })
    expect(denied.status).toBe(404)

    authMock.mockResolvedValue({ user: { id: u.id } })
    const bad = await vote.POST(post('http://l', { resultId: 'not-a-uuid' }), {
      params: Promise.resolve({ runId: run.id }),
    })
    expect(bad.status).toBe(400)
    const ok = await vote.POST(post('http://l', { resultId: winner.id }), {
      params: Promise.resolve({ runId: run.id }),
    })
    expect(ok.status).toBe(200)
    const revealed = ((await ok.json()) as { run: RunView }).run
    expect(revealed.revealed).toBe(true)
    expect(revealed.results.map((r) => r.model).sort()).toEqual(['good-a', 'good-b'])
    expect(revealed.results.find((r) => r.id === winner.id)?.vote).toBe(1)

    const { winRates } = await import('@/lib/db/queries/labRuns')
    const rates = await winRates(u.id)
    expect(rates).toHaveLength(2)
    expect(rates[0]).toMatchObject({ wins: 1, appearances: 1, winRate: 1 })

    const runs = await import('@/app/api/lab/runs/route')
    const list = (await (await runs.GET(new Request('http://l/api/lab/runs'))).json()) as {
      runs: { id: string; voted: boolean; models: string[] }[]
    }
    expect(list.runs[0]).toMatchObject({ id: run.id, voted: true })
    expect(list.runs[0]?.models).toHaveLength(2)
  })

  it('GET /api/lab/runs/[id] 404s for other users and bad ids', async () => {
    await signedInWithKeys()
    const { POST } = await runRoute()
    const { run } = (await (
      await POST(
        post('http://l', {
          prompt: 'hello',
          models: [
            { provider: 'groq', model: 'good-a' },
            { provider: 'groq', model: 'good-b' },
          ],
        }),
      )
    ).json()) as { run: RunView }
    const { GET } = await import('@/app/api/lab/runs/[id]/route')
    const other = await makeUser()
    authMock.mockResolvedValue({ user: { id: other.id } })
    expect((await GET(new Request('http://l'), { params: Promise.resolve({ id: run.id }) })).status).toBe(404)
    expect((await GET(new Request('http://l'), { params: Promise.resolve({ id: 'x' }) })).status).toBe(404)
  })
})
