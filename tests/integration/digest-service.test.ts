import { describe, it, expect } from 'vitest'
import { getUpcomingActions, getRecentActivity } from '@/lib/digest/service'
import { makeUser, makeCompany, makeJob, makeApplication } from '@/tests/factories'
import { db } from '@/lib/db/client'
import { applications, activities } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const DAY_MS = 24 * 60 * 60 * 1000

describe('getUpcomingActions', () => {
  it('returns applications with next_action_at inside the horizon, sorted ascending', async () => {
    const u = await makeUser()
    const c = await makeCompany(u.id)
    const j1 = await makeJob(u.id, c.id, { title: 'Soon' })
    const j2 = await makeJob(u.id, c.id, { title: 'Later' })
    const j3 = await makeJob(u.id, c.id, { title: 'Beyond horizon' })
    const j4 = await makeJob(u.id, c.id, { title: 'No action' })

    const inTwoDays = new Date(Date.now() + 2 * DAY_MS)
    const inSixDays = new Date(Date.now() + 6 * DAY_MS)
    const inThirtyDays = new Date(Date.now() + 30 * DAY_MS)

    const a1 = await makeApplication(u.id, j1.id)
    const a2 = await makeApplication(u.id, j2.id)
    const a3 = await makeApplication(u.id, j3.id)
    await makeApplication(u.id, j4.id) // no next_action_at

    await db.update(applications).set({ nextActionAt: inSixDays }).where(eq(applications.id, a2.id))
    await db.update(applications).set({ nextActionAt: inTwoDays }).where(eq(applications.id, a1.id))
    await db.update(applications).set({ nextActionAt: inThirtyDays }).where(eq(applications.id, a3.id))

    const rows = await getUpcomingActions(u.id, 7)
    expect(rows.map((r) => r.job.title)).toEqual(['Soon', 'Later'])
    expect(rows[0]!.job.company?.name).toBe(c.name)
  })

  it('scopes strictly by userId', async () => {
    const u1 = await makeUser()
    const u2 = await makeUser()
    const c = await makeCompany(u2.id)
    const j = await makeJob(u2.id, c.id)
    const a = await makeApplication(u2.id, j.id)
    await db
      .update(applications)
      .set({ nextActionAt: new Date(Date.now() + DAY_MS) })
      .where(eq(applications.id, a.id))

    const rows = await getUpcomingActions(u1.id, 7)
    expect(rows).toHaveLength(0)
  })
})

describe('getRecentActivity', () => {
  it('returns activities from the past N days newest first', async () => {
    const u = await makeUser()
    const c = await makeCompany(u.id)
    const j = await makeJob(u.id, c.id)
    const a = await makeApplication(u.id, j.id)

    const old = new Date(Date.now() - 30 * DAY_MS)
    const midWeek = new Date(Date.now() - 3 * DAY_MS)
    const now = new Date()

    await db.insert(activities).values([
      { userId: u.id, applicationId: a.id, kind: 'note', payload: { text: 'old' }, createdAt: old },
      { userId: u.id, applicationId: a.id, kind: 'note', payload: { text: 'mid' }, createdAt: midWeek },
      { userId: u.id, applicationId: a.id, kind: 'note', payload: { text: 'now' }, createdAt: now },
    ])

    const rows = await getRecentActivity(u.id, 7)
    expect(rows).toHaveLength(2)
    expect((rows[0]!.payload as { text: string }).text).toBe('now')
    expect((rows[1]!.payload as { text: string }).text).toBe('mid')
  })

  it('scopes strictly by userId', async () => {
    const u1 = await makeUser()
    const u2 = await makeUser()
    const c = await makeCompany(u2.id)
    const j = await makeJob(u2.id, c.id)
    const a = await makeApplication(u2.id, j.id)
    await db.insert(activities).values({
      userId: u2.id,
      applicationId: a.id,
      kind: 'note',
      payload: {},
    })

    const rows = await getRecentActivity(u1.id, 7)
    expect(rows).toHaveLength(0)
  })
})
