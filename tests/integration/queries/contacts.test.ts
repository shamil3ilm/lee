import { describe, it, expect } from 'vitest'
import * as q from '@/lib/db/queries/contacts'
import * as companies from '@/lib/db/queries/companies'
import { makeUser } from '@/tests/factories'

describe('contacts queries', () => {
  it('creates a contact scoped to the user', async () => {
    const u = await makeUser()
    const c = await q.create(u.id, { name: 'Alice', email: 'a@x.com' })
    expect(c.name).toBe('Alice')
    expect(c.userId).toBe(u.id)
  })

  it('lists contacts, optionally filtered by companyId', async () => {
    const u = await makeUser()
    const co = await companies.findOrCreateByDomain(u.id, 'stripe.com', 'Stripe')
    await q.create(u.id, { name: 'Alice', companyId: co.id })
    await q.create(u.id, { name: 'Bob' })
    const all = await q.list(u.id)
    expect(all).toHaveLength(2)
    const forCompany = await q.list(u.id, { companyId: co.id })
    expect(forCompany.map((c) => c.name)).toEqual(['Alice'])
  })

  it('list scopes strictly by userId', async () => {
    const u1 = await makeUser('a@x.com')
    const u2 = await makeUser('b@x.com')
    await q.create(u1.id, { name: 'Alice' })
    expect(await q.list(u2.id)).toEqual([])
  })

  it('getById returns row for owner, undefined for another user', async () => {
    const u1 = await makeUser('a@x.com')
    const u2 = await makeUser('b@x.com')
    const c = await q.create(u1.id, { name: 'Alice' })
    expect(await q.getById(u1.id, c.id)).toBeDefined()
    expect(await q.getById(u2.id, c.id)).toBeUndefined()
  })

  it('update patches fields with userId scope', async () => {
    const u1 = await makeUser('a@x.com')
    const u2 = await makeUser('b@x.com')
    const c = await q.create(u1.id, { name: 'Alice' })
    const updated = await q.update(u1.id, c.id, { role: 'recruiter' })
    expect(updated?.role).toBe('recruiter')
    expect(await q.update(u2.id, c.id, { role: 'hm' })).toBeUndefined()
  })

  it('remove deletes only owned rows', async () => {
    const u1 = await makeUser('a@x.com')
    const u2 = await makeUser('b@x.com')
    const c = await q.create(u1.id, { name: 'Alice' })
    expect(await q.remove(u2.id, c.id)).toBe(false)
    expect(await q.remove(u1.id, c.id)).toBe(true)
    expect(await q.getById(u1.id, c.id)).toBeUndefined()
  })
})
