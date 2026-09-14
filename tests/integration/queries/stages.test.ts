import { describe, it, expect } from 'vitest'
import * as q from '@/lib/db/queries/stages'
import * as applications from '@/lib/db/queries/applications'
import * as jobs from '@/lib/db/queries/jobs'
import * as companies from '@/lib/db/queries/companies'
import { makeUser } from '@/tests/factories'

async function seed(email = 'st@x.com') {
  const u = await makeUser(email)
  const co = await companies.findOrCreateByDomain(u.id, 'stripe.com', 'Stripe')
  const j = await jobs.upsertBySourceUrl(u.id, co.id, {
    title: 'Engineer',
    sourceUrl: `https://stripe.com/jobs/${email}`,
  })
  const app = await applications.create(u.id, { jobId: j.id })
  return { u, app }
}

describe('interview_stages queries', () => {
  it('create inserts a stage scoped by userId + applicationId', async () => {
    const { u, app } = await seed()
    const stage = await q.create(u.id, app.id, {
      kind: 'phone_screen',
      title: 'Phone screen with recruiter',
    })
    expect(stage.userId).toBe(u.id)
    expect(stage.applicationId).toBe(app.id)
    expect(stage.kind).toBe('phone_screen')
    expect(stage.status).toBe('scheduled')
  })

  it('list orders by scheduledAt asc, nulls last', async () => {
    const { u, app } = await seed()
    const later = new Date('2026-12-15T10:00:00Z')
    const sooner = new Date('2026-12-10T10:00:00Z')
    await q.create(u.id, app.id, { kind: 'onsite', scheduledAt: later })
    await q.create(u.id, app.id, { kind: 'take_home' }) // null
    await q.create(u.id, app.id, { kind: 'phone_screen', scheduledAt: sooner })
    const rows = await q.list(u.id, app.id)
    expect(rows.map((r) => r.kind)).toEqual(['phone_screen', 'onsite', 'take_home'])
  })

  it('list scopes to the requesting user', async () => {
    const { u, app } = await seed()
    await q.create(u.id, app.id, { kind: 'phone_screen' })
    const other = await makeUser('other@x.com')
    const rows = await q.list(other.id, app.id)
    expect(rows).toEqual([])
  })

  it('update patches the row', async () => {
    const { u, app } = await seed()
    const stage = await q.create(u.id, app.id, { kind: 'phone_screen' })
    const updated = await q.update(u.id, stage.id, { status: 'completed', outcome: 'advanced' })
    expect(updated?.status).toBe('completed')
    expect(updated?.outcome).toBe('advanced')
  })

  it('update returns undefined for wrong owner', async () => {
    const { u, app } = await seed()
    const stage = await q.create(u.id, app.id, { kind: 'phone_screen' })
    const other = await makeUser('other@x.com')
    const updated = await q.update(other.id, stage.id, { status: 'completed' })
    expect(updated).toBeUndefined()
  })

  it('remove deletes the stage', async () => {
    const { u, app } = await seed()
    const stage = await q.create(u.id, app.id, { kind: 'phone_screen' })
    const ok = await q.remove(u.id, stage.id)
    expect(ok).toBe(true)
    expect(await q.list(u.id, app.id)).toEqual([])
  })

  it('remove is no-op for wrong owner', async () => {
    const { u, app } = await seed()
    const stage = await q.create(u.id, app.id, { kind: 'phone_screen' })
    const other = await makeUser('other@x.com')
    const ok = await q.remove(other.id, stage.id)
    expect(ok).toBe(false)
  })
})
