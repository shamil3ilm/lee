import { describe, it, expect } from 'vitest'
import * as q from '@/lib/db/queries/applications'
import * as jobs from '@/lib/db/queries/jobs'
import * as companies from '@/lib/db/queries/companies'
import { activities } from '@/lib/db/schema'
import { db } from '@/lib/db/client'
import { eq } from 'drizzle-orm'
import { makeUser } from '@/tests/factories'

async function seedApp(email = 'a@x.com') {
  const u = await makeUser(email)
  const co = await companies.findOrCreateByDomain(u.id, 'stripe.com', 'Stripe')
  const j = await jobs.upsertBySourceUrl(u.id, co.id, {
    title: 'Engineer',
    sourceUrl: `https://stripe.com/jobs/${email}`,
  })
  return { u, co, j }
}

describe('applications queries', () => {
  it('create inserts and scopes by userId', async () => {
    const { u, j } = await seedApp()
    const app = await q.create(u.id, { jobId: j.id })
    expect(app.userId).toBe(u.id)
    expect(app.status).toBe('saved')
  })

  it('updateStatus writes an activities row', async () => {
    const { u, j } = await seedApp()
    const app = await q.create(u.id, { jobId: j.id })
    const updated = await q.updateStatus(u.id, app.id, 'applied')
    expect(updated?.status).toBe('applied')
    expect(updated?.appliedAt).toBeInstanceOf(Date)
    const logs = await db.query.activities.findMany({
      where: eq(activities.applicationId, app.id),
    })
    expect(logs).toHaveLength(1)
    expect(logs[0]?.kind).toBe('status_change')
    expect(logs[0]?.payload).toEqual({ from: 'saved', to: 'applied' })
  })

  it('updateStatus is a no-op when status unchanged', async () => {
    const { u, j } = await seedApp()
    const app = await q.create(u.id, { jobId: j.id, status: 'applied' })
    await q.updateStatus(u.id, app.id, 'applied')
    const logs = await db.query.activities.findMany({
      where: eq(activities.applicationId, app.id),
    })
    expect(logs).toHaveLength(0)
  })

  it('updateStatus does not overwrite existing appliedAt', async () => {
    const { u, j } = await seedApp()
    const past = new Date('2025-01-01T00:00:00Z')
    const app = await q.create(u.id, { jobId: j.id, status: 'applied', appliedAt: past })
    await q.updateStatus(u.id, app.id, 'screen')
    const back = await q.updateStatus(u.id, app.id, 'applied')
    expect(back?.appliedAt?.toISOString()).toBe(past.toISOString())
  })

  it('list filters by status and scopes by userId', async () => {
    const { u, j } = await seedApp()
    await q.create(u.id, { jobId: j.id, status: 'saved' })
    await q.create(u.id, { jobId: j.id, status: 'applied' })
    const saved = await q.list(u.id, { status: 'saved' })
    expect(saved).toHaveLength(1)
    const other = await makeUser('b@x.com')
    expect(await q.list(other.id)).toEqual([])
  })

  it('getById returns joined job and company for owner', async () => {
    const { u, j } = await seedApp()
    const app = await q.create(u.id, { jobId: j.id })
    const full = await q.getById(u.id, app.id)
    expect(full?.job.title).toBe('Engineer')
    expect(full?.job.company?.domain).toBe('stripe.com')
  })

  it('setNextAction stores the timestamp', async () => {
    const { u, j } = await seedApp()
    const app = await q.create(u.id, { jobId: j.id })
    const when = new Date('2026-12-01T00:00:00Z')
    await q.setNextAction(u.id, app.id, when)
    const row = await q.getById(u.id, app.id)
    expect(row?.nextActionAt?.toISOString()).toBe(when.toISOString())
  })
})

describe('listWithJobsByIds', () => {
  it('returns full job rows for the given ids, scoped to the user', async () => {
    const { makeCompany, makeJob, makeApplication } = await import('@/tests/factories')
    const u = await makeUser('batch-owner@x.com')
    const other = await makeUser('batch-other@x.com')
    const c = await makeCompany(u.id)
    const j = await makeJob(u.id, c.id)
    const a1 = await makeApplication(u.id, j.id)
    const oc = await makeCompany(other.id)
    const oj = await makeJob(other.id, oc.id)
    const foreign = await makeApplication(other.id, oj.id)

    const rows = await q.listWithJobsByIds(u.id, [a1.id, foreign.id])
    expect(rows.map((r) => r.id)).toEqual([a1.id])
    expect(rows[0]!.job.id).toBe(j.id)
    expect(rows[0]!.job).toHaveProperty('descriptionMd')
    expect(rows[0]!.job.company?.id).toBe(c.id)
  })

  it('returns nothing for an empty id list', async () => {
    const u = await makeUser('batch-empty@x.com')
    expect(await q.listWithJobsByIds(u.id, [])).toEqual([])
  })
})
