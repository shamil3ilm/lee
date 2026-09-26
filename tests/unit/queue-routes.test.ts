import { afterEach, describe, expect, it, vi } from 'vitest'

// Draining loads the app handlers, which import lib/ai; keep the Google SDK
// out of the shared module cache (see cron-sync-all.test.ts).
vi.mock('@/lib/ai', () => ({
  getAIProvider: () => ({}),
  getAIProviderForUser: async () => ({}),
  MODEL_REGISTRY: [],
  DEFAULT_MODEL_ID: 'gemini:gemini-2.0-flash',
  findModel: () => null,
}))

import { GET as scheduleGET } from '@/app/api/cron/schedule/route'
import { GET as drainGET } from '@/app/api/cron/drain/route'
import { POST as workerPOST } from '@/app/api/internal/queue/drain/route'
import { db } from '@/lib/db/client'
import { queueJobs } from '@/lib/db/schema'
import { env } from '@/lib/env'
import { enqueue } from '@/lib/queue/queue'
import { signQueueRequest, SIGNATURE_HEADER, TIMESTAMP_HEADER } from '@/lib/queue/signature'
import { makeUser } from '@/tests/factories'

const mutableEnv = env as { QUEUE_WORKER_SECRET?: string }
const SECRET = 'q'.repeat(40)

function cronRequest(path: string, auth?: string): Request {
  return new Request(`http://localhost${path}`, {
    headers: auth ? { authorization: auth } : {},
  })
}

function workerRequest(body: string, opts: { secret?: string; ts?: number } = {}): Request {
  const ts = String(Math.floor((opts.ts ?? Date.now()) / 1000))
  return new Request('http://localhost/api/internal/queue/drain', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      [TIMESTAMP_HEADER]: ts,
      [SIGNATURE_HEADER]: signQueueRequest(opts.secret ?? SECRET, ts, body),
    },
  })
}

afterEach(() => {
  delete mutableEnv.QUEUE_WORKER_SECRET
})

describe('cron queue routes', () => {
  it('reject requests without the cron secret', async () => {
    for (const get of [scheduleGET, drainGET]) {
      expect((await get(cronRequest('/x'))).status).toBe(401)
      expect((await get(cronRequest('/x', 'Bearer nope'))).status).toBe(401)
    }
  })

  it('schedule enqueues the day (idempotently) and drains', async () => {
    await makeUser()
    const auth = `Bearer ${env.CRON_SECRET}`
    const first = await scheduleGET(cronRequest('/api/cron/schedule', auth))
    expect(first.status).toBe(200)
    const body = (await first.json()) as { schedule: { enqueued: number }; drain: { claimed: number } }
    expect(body.schedule.enqueued).toBe(6) // reminders + followups, gmail, digest, scam, email
    expect(body.drain.claimed).toBe(6)
    const again = (await (await scheduleGET(cronRequest('/api/cron/schedule', auth))).json()) as {
      schedule: { enqueued: number }
    }
    expect(again.schedule.enqueued).toBe(0)
  })

  it('drain runs due jobs and reports counts only', async () => {
    await enqueue('reminders:all', {})
    const res = await drainGET(cronRequest('/api/cron/drain', `Bearer ${env.CRON_SECRET}`))
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.done).toBe(1)
    expect(body).not.toHaveProperty('errors')
    expect(body).not.toHaveProperty('workerId')
  })
})

describe('POST /api/internal/queue/drain', () => {
  it('is disabled (404) when QUEUE_WORKER_SECRET is unset', async () => {
    expect((await workerPOST(workerRequest('{}'))).status).toBe(404)
  })

  it('rejects bad signatures, wrong secrets and stale timestamps', async () => {
    mutableEnv.QUEUE_WORKER_SECRET = SECRET
    expect((await workerPOST(workerRequest('{}', { secret: 'w'.repeat(40) }))).status).toBe(401)
    expect((await workerPOST(workerRequest('{}', { ts: Date.now() - 10 * 60 * 1000 }))).status).toBe(401)
    const tampered = workerRequest('{"maxJobs":1}')
    const forged = new Request(tampered.url, { method: 'POST', headers: tampered.headers, body: '{"maxJobs":2}' })
    expect((await workerPOST(forged)).status).toBe(401)
    const unsigned = new Request('http://localhost/api/internal/queue/drain', { method: 'POST', body: '{}' })
    expect((await workerPOST(unsigned)).status).toBe(401)
  })

  it('rejects invalid bodies after a valid signature', async () => {
    mutableEnv.QUEUE_WORKER_SECRET = SECRET
    expect((await workerPOST(workerRequest('not json'))).status).toBe(400)
    expect((await workerPOST(workerRequest('{"budgetMs":999999}'))).status).toBe(400)
    expect((await workerPOST(workerRequest('{"extra":1}'))).status).toBe(400)
  })

  it('drains with a valid signature', async () => {
    mutableEnv.QUEUE_WORKER_SECRET = SECRET
    await enqueue('reminders:all', {})
    const res = await workerPOST(workerRequest('{"budgetMs":20000,"maxJobs":5}'))
    expect(res.status).toBe(200)
    expect(((await res.json()) as { done: number }).done).toBe(1)
    const rows = await db.select().from(queueJobs)
    expect(rows.every((r) => r.status === 'done')).toBe(true)
  })
})
