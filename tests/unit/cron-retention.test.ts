import { describe, it, expect } from 'vitest'
import { GET } from '@/app/api/cron/retention/route'
import { db } from '@/lib/db/client'
import * as s from '@/lib/db/schema'
import { env } from '@/lib/env'
import { makeUser } from '@/tests/factories'

function buildRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/cron/retention', { method: 'GET', headers })
}

describe('GET /api/cron/retention', () => {
  it('rejects requests without the cron secret', async () => {
    expect((await GET(buildRequest() as never)).status).toBe(401)
    expect((await GET(buildRequest({ authorization: 'Bearer nope' }) as never)).status).toBe(401)
  })

  it('prunes old rows and reports counts', async () => {
    const u = await makeUser()
    await db.insert(s.aiCallLogs).values({
      userId: u.id,
      provider: 'gemini',
      kind: 'k',
      status: 'ok',
      createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
    })
    const res = await GET(buildRequest({ authorization: `Bearer ${env.CRON_SECRET}` }) as never)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, number>
    expect(body.aiCallLogs).toBe(1)
    expect(await db.select().from(s.aiCallLogs)).toHaveLength(0)
  })
})
