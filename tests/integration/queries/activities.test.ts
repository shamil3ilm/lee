import { describe, it, expect } from 'vitest'
import * as q from '@/lib/db/queries/activities'
import * as applications from '@/lib/db/queries/applications'
import * as jobs from '@/lib/db/queries/jobs'
import * as companies from '@/lib/db/queries/companies'
import { makeUser } from '@/tests/factories'

async function seed(email = 'ac@x.com') {
  const u = await makeUser(email)
  const co = await companies.findOrCreateByDomain(u.id, 'stripe.com', 'Stripe')
  const j = await jobs.upsertBySourceUrl(u.id, co.id, {
    title: 'Engineer',
    sourceUrl: `https://stripe.com/jobs/${email}`,
  })
  const app = await applications.create(u.id, { jobId: j.id })
  return { u, app }
}

describe('activities queries', () => {
  it('log inserts a row with the payload preserved', async () => {
    const { u, app } = await seed()
    const row = await q.log(u.id, app.id, 'note', { text: 'chatted with recruiter', meta: { n: 1 } })
    expect(row.kind).toBe('note')
    expect(row.payload).toEqual({ text: 'chatted with recruiter', meta: { n: 1 } })
    expect(row.userId).toBe(u.id)
    expect(row.applicationId).toBe(app.id)
  })

  it('list returns rows newest first', async () => {
    const { u, app } = await seed()
    await q.log(u.id, app.id, 'first', { i: 1 })
    // guarantee monotonic ordering — createdAt has ms precision but tests can be flaky
    await new Promise((r) => setTimeout(r, 5))
    await q.log(u.id, app.id, 'second', { i: 2 })
    await new Promise((r) => setTimeout(r, 5))
    await q.log(u.id, app.id, 'third', { i: 3 })
    const rows = await q.list(u.id, app.id)
    expect(rows.map((r) => r.kind)).toEqual(['third', 'second', 'first'])
  })

  it('list respects the limit option', async () => {
    const { u, app } = await seed()
    for (let i = 0; i < 5; i += 1) {
      await q.log(u.id, app.id, `k${i}`, { i })
      await new Promise((r) => setTimeout(r, 2))
    }
    const rows = await q.list(u.id, app.id, { limit: 2 })
    expect(rows).toHaveLength(2)
  })

  it('list scopes to the requesting user', async () => {
    const { u, app } = await seed()
    await q.log(u.id, app.id, 'note', { x: 1 })
    const other = await makeUser('other@x.com')
    const rows = await q.list(other.id, app.id)
    expect(rows).toEqual([])
  })
})
