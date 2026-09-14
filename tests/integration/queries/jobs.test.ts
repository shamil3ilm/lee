import { describe, it, expect } from 'vitest'
import * as q from '@/lib/db/queries/jobs'
import * as companies from '@/lib/db/queries/companies'
import { makeUser } from '@/tests/factories'

describe('jobs queries', () => {
  it('upsertBySourceUrl creates then updates on conflict', async () => {
    const u = await makeUser()
    const co = await companies.findOrCreateByDomain(u.id, 'stripe.com', 'Stripe')
    const url = 'https://stripe.com/jobs/1'
    const a = await q.upsertBySourceUrl(u.id, co.id, {
      title: 'Engineer',
      sourceUrl: url,
      location: 'Remote',
    })
    const b = await q.upsertBySourceUrl(u.id, co.id, {
      title: 'Senior Engineer',
      sourceUrl: url,
    })
    expect(a.id).toBe(b.id)
    expect(b.title).toBe('Senior Engineer')
  })

  it('scopes strictly by userId (same URL, different users -> two rows)', async () => {
    const u1 = await makeUser('a@x.com')
    const u2 = await makeUser('b@x.com')
    const url = 'https://stripe.com/jobs/1'
    const j1 = await q.upsertBySourceUrl(u1.id, null, {
      title: 'Engineer',
      sourceUrl: url,
    })
    const j2 = await q.upsertBySourceUrl(u2.id, null, {
      title: 'Engineer',
      sourceUrl: url,
    })
    expect(j1.id).not.toBe(j2.id)
    expect((await q.list(u1.id)).map((j) => j.id)).toEqual([j1.id])
  })

  it('getById is scoped', async () => {
    const u1 = await makeUser('a@x.com')
    const u2 = await makeUser('b@x.com')
    const j = await q.upsertBySourceUrl(u1.id, null, {
      title: 'Eng',
      sourceUrl: 'https://x.com/j',
    })
    expect(await q.getById(u1.id, j.id)).toBeDefined()
    expect(await q.getById(u2.id, j.id)).toBeUndefined()
  })

  it('update patches fields', async () => {
    const u = await makeUser()
    const j = await q.upsertBySourceUrl(u.id, null, {
      title: 'Eng',
      sourceUrl: 'https://x.com/j',
    })
    const updated = await q.update(u.id, j.id, { location: 'Dubai' })
    expect(updated?.location).toBe('Dubai')
  })
})
