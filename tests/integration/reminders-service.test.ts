import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { activities } from '@/lib/db/schema'
import { recordDueReminders } from '@/lib/reminders/service'
import { makeApplication, makeCompany, makeJob, makeUser } from '@/tests/factories'

const DAY = 24 * 60 * 60 * 1000

async function remindersFor(applicationId: string) {
  return (await db.select().from(activities).where(eq(activities.applicationId, applicationId))).filter(
    (a) => a.kind === 'reminder',
  )
}

describe('recordDueReminders', () => {
  it('inserts at most one reminder per overdue application per day', async () => {
    const u = await makeUser()
    const co = await makeCompany(u.id)
    const now = new Date('2026-09-26T09:00:00Z')
    const due = await makeApplication(u.id, (await makeJob(u.id, co.id)).id, {
      status: 'applied',
      nextActionAt: new Date(now.getTime() - 3 * DAY),
    })

    expect(await recordDueReminders(now)).toEqual({ due: 1, inserted: 1 })
    // Re-run the same day (manual trigger, retry): nothing new.
    expect(await recordDueReminders(new Date(now.getTime() + 2 * 60 * 60 * 1000))).toEqual({
      due: 1,
      inserted: 0,
    })
    expect(await remindersFor(due.id)).toHaveLength(1)

    // Next day it is still overdue → exactly one more.
    expect(await recordDueReminders(new Date(now.getTime() + DAY))).toEqual({ due: 1, inserted: 1 })
    expect(await remindersFor(due.id)).toHaveLength(2)
  })

  it('skips not-yet-due, unscheduled and terminal applications', async () => {
    const u = await makeUser()
    const co = await makeCompany(u.id)
    const now = new Date()
    const job = async () => (await makeJob(u.id, co.id)).id
    await makeApplication(u.id, await job(), { status: 'applied', nextActionAt: new Date(now.getTime() + DAY) })
    await makeApplication(u.id, await job(), { status: 'applied', nextActionAt: null })
    await makeApplication(u.id, await job(), { status: 'rejected', nextActionAt: new Date(now.getTime() - DAY) })
    await makeApplication(u.id, await job(), { status: 'withdrawn', nextActionAt: new Date(now.getTime() - DAY) })
    expect(await recordDueReminders(now)).toEqual({ due: 0, inserted: 0 })
    expect(await db.select().from(activities)).toHaveLength(0)
  })

  it('writes the same payload the cron always wrote', async () => {
    const u = await makeUser()
    const co = await makeCompany(u.id)
    const app = await makeApplication(u.id, (await makeJob(u.id, co.id)).id, {
      status: 'screen',
      nextActionAt: new Date(Date.now() - 60_000),
    })
    await recordDueReminders()
    const [row] = await remindersFor(app.id)
    expect(row?.userId).toBe(u.id)
    expect(row?.payload).toEqual({ reason: 'next_action_at reached' })
  })
})
