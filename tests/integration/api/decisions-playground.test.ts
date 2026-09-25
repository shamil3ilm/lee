import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeUser } from '@/tests/factories'
import * as profileQ from '@/lib/db/queries/profile'

// Auth stub — the route reads session.user.id via `auth()`.
const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ auth: authMock }))

async function importRoute() {
  return import('@/app/api/decisions/playground/route')
}

function buildRequest(body: unknown): Request {
  return new Request('http://localhost/api/decisions/playground', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  authMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/decisions/playground', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null)
    const { POST } = await importRoute()
    const res = await POST(
      buildRequest({
        type: 'yesNo',
        text: 'hi',
        question: 'is this a greeting',
        providers: ['heuristic'],
      }),
    )
    expect(res.status).toBe(401)
  })

  it('rejects invalid JSON body with 400', async () => {
    const u = await makeUser(`pg-badjson-${Math.random()}@x.com`)
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { POST } = await importRoute()
    const req = new Request('http://localhost/api/decisions/playground', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('validates provider list: rejects an empty providers array', async () => {
    const u = await makeUser(`pg-noprov-${Math.random()}@x.com`)
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { POST } = await importRoute()
    const res = await POST(
      buildRequest({
        type: 'yesNo',
        text: 'hi',
        question: 'is this a greeting',
        providers: [],
      }),
    )
    expect(res.status).toBe(400)
  })

  it('validates choice: options are required', async () => {
    const u = await makeUser(`pg-choice-nomiss-${Math.random()}@x.com`)
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { POST } = await importRoute()
    const res = await POST(
      buildRequest({
        type: 'choice',
        text: 'Starbucks',
        providers: ['heuristic'],
      }),
    )
    expect(res.status).toBe(400)
  })

  it('validates yesNo: question is required', async () => {
    const u = await makeUser(`pg-yn-noq-${Math.random()}@x.com`)
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { POST } = await importRoute()
    const res = await POST(
      buildRequest({
        type: 'yesNo',
        text: 'hi',
        providers: ['heuristic'],
      }),
    )
    expect(res.status).toBe(400)
  })

  it('validates score: rubric is required and scale must be strictly increasing', async () => {
    const u = await makeUser(`pg-score-bad-${Math.random()}@x.com`)
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { POST } = await importRoute()

    const noRubric = await POST(
      buildRequest({
        type: 'score',
        text: 'urgent!',
        providers: ['heuristic'],
      }),
    )
    expect(noRubric.status).toBe(400)

    const badScale = await POST(
      buildRequest({
        type: 'score',
        text: 'urgent!',
        rubric: 'How urgent?',
        scale: [5, 5],
        providers: ['heuristic'],
      }),
    )
    expect(badScale.status).toBe(400)
  })

  it('runs a choice via heuristic — returns pick + confidence + latency + raw', async () => {
    const u = await makeUser(`pg-choice-${Math.random()}@x.com`)
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { POST } = await importRoute()
    const res = await POST(
      buildRequest({
        type: 'choice',
        text: 'Netflix monthly subscription',
        options: ['subscription', 'dining', 'other'],
        providers: ['heuristic'],
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      results: Array<{
        provider: string
        ok: boolean
        latencyMs: number
        result?: { pick?: string; confidence?: number }
        raw?: unknown
      }>
    }
    expect(body.results).toHaveLength(1)
    const row = body.results[0]!
    expect(row.provider).toBe('heuristic')
    expect(row.ok).toBe(true)
    expect(row.result?.pick).toBe('subscription')
    expect(row.result?.confidence).toBeCloseTo(0.7, 5)
    expect(typeof row.latencyMs).toBe('number')
    expect(row.raw).toBeDefined()
  })

  it('runs a yesNo via heuristic', async () => {
    const u = await makeUser(`pg-yn-${Math.random()}@x.com`)
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { POST } = await importRoute()
    const res = await POST(
      buildRequest({
        type: 'yesNo',
        text: 'This role has been approved by the hiring manager',
        question: 'Is this a match?',
        providers: ['heuristic'],
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      results: Array<{ ok: boolean; result?: { answer?: boolean } }>
    }
    expect(body.results[0]!.ok).toBe(true)
    // Heuristic yesNo returns true when the input contains a positive word
    // like 'approved'.
    expect(body.results[0]!.result?.answer).toBe(true)
  })

  it('runs a score via heuristic — midpoint of the requested scale', async () => {
    const u = await makeUser(`pg-score-${Math.random()}@x.com`)
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { POST } = await importRoute()
    const res = await POST(
      buildRequest({
        type: 'score',
        text: 'Customer double-charged, threatens to cancel',
        rubric: 'How urgent?',
        scale: [0, 5],
        providers: ['heuristic'],
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      results: Array<{ ok: boolean; result?: { score?: number } }>
    }
    expect(body.results[0]!.ok).toBe(true)
    // Heuristic score = midpoint = 2.5 for [0,5].
    expect(body.results[0]!.result?.score).toBe(2.5)
  })

  it('mixes multiple providers in one call — heuristic + laya (mocked)', async () => {
    const u = await makeUser(`pg-mix-${Math.random()}@x.com`)
    authMock.mockResolvedValue({ user: { id: u.id } })

    // Force groq to error even if a real key is loaded — we don't want the
    // test to actually hit the Groq API. Stub fetch to return a network-like
    // failure; heuristic still succeeds so the test is deterministic.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('mocked network failure'),
    )

    const { POST } = await importRoute()
    const res = await POST(
      buildRequest({
        type: 'yesNo',
        text: 'A senior PHP/Laravel role in Dubai fintech',
        question: 'Match?',
        providers: ['heuristic', 'laya'],
        // Provide an endpoint so laya doesn't need to look up profile config.
        layaEndpoint: 'https://example.invalid.local',
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      results: Array<{ provider: string; ok: boolean; error?: string }>
    }
    expect(body.results).toHaveLength(2)
    const heur = body.results.find((r) => r.provider === 'heuristic')!
    const laya = body.results.find((r) => r.provider === 'laya')!
    expect(heur.ok).toBe(true)
    // laya was told to hit example.invalid.local; fetch is mocked to fail
    // → row must be ok:false with an error message.
    expect(laya.ok).toBe(false)
    expect(laya.error).toBeTruthy()

    fetchSpy.mockRestore()
  })

  it('groq without a key returns an error row (not a 500) so other providers still run', async () => {
    const u = await makeUser(`pg-nogroq-${Math.random()}@x.com`)
    authMock.mockResolvedValue({ user: { id: u.id } })

    // Temporarily unset the key. The route reads env at import time via
    // `@/lib/env` so we cache-bust modules and re-import.
    const orig = process.env.GROQ_API_KEY
    delete process.env.GROQ_API_KEY
    vi.resetModules()

    try {
      const { POST } = await importRoute()
      const res = await POST(
        buildRequest({
          type: 'yesNo',
          text: 'hi',
          question: 'is this a greeting',
          providers: ['groq', 'heuristic'],
        }),
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        results: Array<{ provider: string; ok: boolean; error?: string }>
      }
      const groq = body.results.find((r) => r.provider === 'groq')!
      const heur = body.results.find((r) => r.provider === 'heuristic')!
      expect(groq.ok).toBe(false)
      expect(groq.error).toMatch(/GROQ_API_KEY/)
      expect(heur.ok).toBe(true)
    } finally {
      if (orig !== undefined) process.env.GROQ_API_KEY = orig
      vi.resetModules()
    }
  })

  it('falls back to profile.layaEndpoint when no per-call override is sent', async () => {
    const u = await makeUser(`pg-profile-laya-${Math.random()}@x.com`)
    await profileQ.upsert(u.id, {
      decisionProvider: 'laya',
      layaEndpoint: 'https://from-profile.invalid.local',
    })
    authMock.mockResolvedValue({ user: { id: u.id } })

    // Capture the URL Laya tries to POST to.
    const seen: string[] = []
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: RequestInfo | URL) => {
        seen.push(String(input))
        throw new Error('mocked')
      })

    const { POST } = await importRoute()
    const res = await POST(
      buildRequest({
        type: 'yesNo',
        text: 'hi',
        question: 'is this a greeting',
        providers: ['laya'],
        // no layaEndpoint override — should read from profile
      }),
    )
    expect(res.status).toBe(200)
    expect(seen.some((u) => u.includes('from-profile.invalid.local'))).toBe(true)

    fetchSpy.mockRestore()
  })
})
