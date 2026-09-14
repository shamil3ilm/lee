import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { GET } from '@/app/api/cron/reminders/route'
import { db } from '@/lib/db/client'
import { activities } from '@/lib/db/schema'
import { env } from '@/lib/env'
import { makeApplication, makeCompany, makeJob, makeUser } from '@/tests/factories'

function buildRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/cron/reminders', {
    method: 'GET',
    headers,
  })
}

describe('GET /api/cron/reminders', () => {
  it('rejects requests without the correct bearer token', async () => {
    const res = await GET(buildRequest() as never)
    expect(res.status).toBe(401)
  })

  it('rejects requests with a wrong bearer token', async () => {
    const res = await GET(
      buildRequest({ authorization: 'Bearer nope' }) as never,
    )
    expect(res.status).toBe(401)
  })

  it('inserts reminder activities for due applications and skips non-due / terminal ones', async () => {
    const user = await makeUser()
    const company = await makeCompany(user.id)

    const dueJob = await makeJob(user.id, company.id)
    const notDueJob = await makeJob(user.id, company.id)
    const rejectedJob = await makeJob(user.id, company.id)
    const nullActionJob = await makeJob(user.id, company.id)

    const past = new Date(Date.now() - 60_000)
    const future = new Date(Date.now() + 60 * 60_000)

    const dueApp = await makeApplication(user.id, dueJob.id, {
      status: 'applied',
      nextActionAt: past,
    })
    await makeApplication(user.id, notDueJob.id, {
      status: 'applied',
      nextActionAt: future,
    })
    await makeApplication(user.id, rejectedJob.id, {
      status: 'rejected',
      nextActionAt: past,
    })
    await makeApplication(user.id, nullActionJob.id, {
      status: 'applied',
      nextActionAt: null,
    })

    const res = await GET(
      buildRequest({ authorization: `Bearer ${env.CRON_SECRET}` }) as never,
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { checked: number; reminders_added: number }
    expect(body).toEqual({ checked: 1, reminders_added: 1 })

    const rows = await db
      .select()
      .from(activities)
      .where(eq(activities.applicationId, dueApp.id))

    expect(rows).toHaveLength(1)
    expect(rows[0]?.kind).toBe('reminder')
    expect(rows[0]?.payload).toEqual({ reason: 'next_action_at reached' })
    expect(rows[0]?.userId).toBe(user.id)
  })
})
