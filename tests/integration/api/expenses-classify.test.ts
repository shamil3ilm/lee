import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as profileQ from '@/lib/db/queries/profile'
import { makeUser } from '@/tests/factories'

// The route calls `auth()`; stub per test so we can control which user id is
// on the session without going through NextAuth.
const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ auth: authMock }))

// Import the route AFTER the mock is registered so it picks up the stub.
async function importRoute() {
  return import('@/app/api/expenses/classify/route')
}

function buildRequest(body: unknown): Request {
  return new Request('http://localhost/api/expenses/classify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  authMock.mockReset()
})

describe('POST /api/expenses/classify — per-user decision provider', () => {
  it('uses the heuristic provider when the user picked it on their profile', async () => {
    const u = await makeUser(`classify-heuristic-${Math.random()}@x.com`)
    // Persist the per-user override. Empty layaEndpoint — heuristic doesn't
    // touch it anyway.
    await profileQ.upsert(u.id, { decisionProvider: 'heuristic', layaEndpoint: null })
    authMock.mockResolvedValue({ user: { id: u.id } })

    // Vendor that hits a keyword in the heuristic map (`starbucks` → dining).
    // If Groq were to be called instead, this test would flake on network /
    // require an API key; heuristic is deterministic.
    const { POST } = await importRoute()
    const res = await POST(buildRequest({ vendor: 'Starbucks Downtown', description: 'coffee' }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { category: string; confidence: number }
    // The heuristic returns confidence 0.7 on a keyword hit. If we had fallen
    // back to Groq (env default) confidence would come from the LLM — and the
    // call would try to hit the network in a test env without a key.
    expect(body.category).toBe('dining')
    expect(body.confidence).toBeCloseTo(0.7, 5)
  })

  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null)
    const { POST } = await importRoute()
    const res = await POST(buildRequest({ vendor: 'x' }))
    expect(res.status).toBe(401)
  })

  it('returns 200 with a skip envelope when neither vendor nor description is supplied', async () => {
    // v10 — the signal-check gate refuses the request rather than 400-ing.
    // Client shows the fixHint as a toast; the request itself is valid.
    const u = await makeUser(`classify-empty-${Math.random()}@x.com`)
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { POST } = await importRoute()
    const res = await POST(buildRequest({}))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { skipped?: boolean; code?: string }
    expect(body.skipped).toBe(true)
    expect(body.code).toBe('expense_no_signal')
  })
})
