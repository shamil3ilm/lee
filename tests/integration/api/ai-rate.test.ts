import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '@/lib/db/client'
import { aiCallLogs } from '@/lib/db/schema'
import * as docsQ from '@/lib/db/queries/documents'
import * as aiCallLogsQ from '@/lib/db/queries/aiCallLogs'
import { makeUser } from '@/tests/factories'

// Stub auth per test so we can control the session user id without hitting
// NextAuth from a unit-test environment.
const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ auth: authMock }))

async function importRoutes() {
  const aiCallRate = await import('@/app/api/ai-calls/[id]/rate/route')
  const docRate = await import('@/app/api/documents/[id]/rate/route')
  return { aiCallRate, docRate }
}

function buildRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  authMock.mockReset()
})

async function seedCallLog(userId: string, documentId: string | null = null) {
  const [row] = await db
    .insert(aiCallLogs)
    .values({
      userId,
      provider: 'gemini',
      kind: 'tailored_cv',
      status: 'ok',
      documentId,
    })
    .returning()
  if (!row) throw new Error('failed to seed ai_call_log')
  return row
}

describe('POST /api/ai-calls/[id]/rate', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null)
    const { aiCallRate } = await importRoutes()
    const res = await aiCallRate.POST(
      buildRequest('http://localhost/api/ai-calls/x/rate', { rating: 5 }),
      { params: Promise.resolve({ id: 'x' }) },
    )
    expect(res.status).toBe(401)
  })

  it('persists a thumbs-up (rating=5)', async () => {
    const u = await makeUser(`rate-up-${Math.random()}@x.com`)
    const call = await seedCallLog(u.id)
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { aiCallRate } = await importRoutes()
    const res = await aiCallRate.POST(
      buildRequest(`http://localhost/api/ai-calls/${call.id}/rate`, { rating: 5 }),
      { params: Promise.resolve({ id: call.id }) },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; rating: number }
    expect(body.rating).toBe(5)
    const after = await aiCallLogsQ.getById(u.id, call.id)
    expect(after?.userRating).toBe(5)
  })

  it('records an implicit action without a rating', async () => {
    const u = await makeUser(`rate-action-${Math.random()}@x.com`)
    const call = await seedCallLog(u.id)
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { aiCallRate } = await importRoutes()
    const res = await aiCallRate.POST(
      buildRequest(`http://localhost/api/ai-calls/${call.id}/rate`, {
        action: 'regenerated',
      }),
      { params: Promise.resolve({ id: call.id }) },
    )
    expect(res.status).toBe(200)
    const after = await aiCallLogsQ.getById(u.id, call.id)
    expect(after?.userAction).toBe('regenerated')
    expect(after?.userRating).toBeNull()
  })

  it('returns 404 for a call owned by a different user', async () => {
    const owner = await makeUser(`rate-owner-${Math.random()}@x.com`)
    const other = await makeUser(`rate-other-${Math.random()}@x.com`)
    const call = await seedCallLog(owner.id)
    authMock.mockResolvedValue({ user: { id: other.id } })
    const { aiCallRate } = await importRoutes()
    const res = await aiCallRate.POST(
      buildRequest(`http://localhost/api/ai-calls/${call.id}/rate`, { rating: 1 }),
      { params: Promise.resolve({ id: call.id }) },
    )
    expect(res.status).toBe(404)
  })
})

describe('POST /api/documents/[id]/rate', () => {
  it('finds the latest OK call for the document and rates it', async () => {
    const u = await makeUser(`docrate-${Math.random()}@x.com`)
    const doc = await docsQ.create(u.id, {
      applicationId: null,
      kind: 'master_cv',
      version: 1,
      title: 'CV',
      content: { basics: { name: 'Ada', headline: 'x' }, skills: { primary: [] } },
    })
    const call = await seedCallLog(u.id, doc.id)
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { docRate } = await importRoutes()
    const res = await docRate.POST(
      buildRequest(`http://localhost/api/documents/${doc.id}/rate`, { rating: 1 }),
      { params: Promise.resolve({ id: doc.id }) },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; rating: number; callId: string }
    expect(body.rating).toBe(1)
    expect(body.callId).toBe(call.id)
  })

  it('returns 404 when no call is linked to the document', async () => {
    const u = await makeUser(`docrate-nolink-${Math.random()}@x.com`)
    const doc = await docsQ.create(u.id, {
      applicationId: null,
      kind: 'master_cv',
      version: 1,
      title: 'CV',
      content: { basics: { name: 'Ada', headline: 'x' }, skills: { primary: [] } },
    })
    authMock.mockResolvedValue({ user: { id: u.id } })
    const { docRate } = await importRoutes()
    const res = await docRate.POST(
      buildRequest(`http://localhost/api/documents/${doc.id}/rate`, { rating: 5 }),
      { params: Promise.resolve({ id: doc.id }) },
    )
    expect(res.status).toBe(404)
  })
})
