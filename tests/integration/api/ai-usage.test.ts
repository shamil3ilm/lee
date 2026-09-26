import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db/client'
import { aiCallLogs, documents } from '@/lib/db/schema'
import * as aiCallLogsQ from '@/lib/db/queries/aiCallLogs'
import { makeUser } from '@/tests/factories'

const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ auth: authMock }))

beforeEach(() => authMock.mockReset())

async function seed(userId: string, over: Partial<typeof aiCallLogs.$inferInsert> = {}) {
  const [row] = await db
    .insert(aiCallLogs)
    .values({
      userId,
      provider: 'groq',
      model: 'openai/gpt-oss-20b',
      kind: 'score_job',
      status: 'ok',
      promptTokens: 900,
      completionTokens: 120,
      latencyMs: 800,
      ...over,
    })
    .returning()
  return row!
}

describe('GET /api/ai-calls/[id]/usage', () => {
  async function get(id: string) {
    const { GET } = await import('@/app/api/ai-calls/[id]/usage/route')
    return GET(new Request(`http://x/api/ai-calls/${id}/usage`), { params: Promise.resolve({ id }) })
  }

  it('returns the usage of the caller’s own call', async () => {
    const u = await makeUser()
    authMock.mockResolvedValue({ user: { id: u.id } })
    const row = await seed(u.id)
    const res = await get(row.id)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { usage: unknown }).usage).toMatchObject({
      callId: row.id,
      provider: 'groq',
      model: 'openai/gpt-oss-20b',
      inputTokens: 900,
      outputTokens: 120,
      latencyMs: 800,
      calls: 1,
    })
  })

  it('404s for another user’s call and 401s when signed out', async () => {
    const [a, b] = [await makeUser(), await makeUser()]
    const row = await seed(a.id)
    authMock.mockResolvedValue({ user: { id: b.id } })
    expect((await get(row.id)).status).toBe(404)
    authMock.mockResolvedValue(null)
    expect((await get(row.id)).status).toBe(401)
  })

  it('400s on a malformed id', async () => {
    const u = await makeUser()
    authMock.mockResolvedValue({ user: { id: u.id } })
    expect((await get('nope')).status).toBe(400)
  })
})

describe('usageByDocument', () => {
  it('returns the latest successful call per document, scoped to the user', async () => {
    const [u, other] = [await makeUser(), await makeUser()]
    const [d1, d2] = await db
      .insert(documents)
      .values([
        { userId: u.id, kind: 'cover_letter', title: 'a', content: {} },
        { userId: u.id, kind: 'tailored_cv', title: 'b', content: {} },
      ])
      .returning()
    await seed(u.id, { documentId: d1!.id, promptTokens: 1, createdAt: new Date(Date.now() - 60_000) })
    await seed(u.id, { documentId: d1!.id, promptTokens: 2 })
    await seed(u.id, { documentId: d1!.id, status: 'error', promptTokens: 99 })
    await seed(other.id, { documentId: d2!.id })

    const map = await aiCallLogsQ.usageByDocument(u.id, [d1!.id, d2!.id])
    expect(Object.keys(map)).toEqual([d1!.id])
    expect(map[d1!.id]?.inputTokens).toBe(2)
    expect(await aiCallLogsQ.usageByDocument(u.id, [])).toEqual({})
  })
})
