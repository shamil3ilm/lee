import { describe, it, expect } from 'vitest'
import * as q from '@/lib/db/queries/companies'
import { makeApplication, makeCompany, makeContact, makeJob, makeUser } from '@/tests/factories'

describe('companies queries', () => {
  it('findOrCreateByDomain creates once, returns existing on second call', async () => {
    const u = await makeUser()
    const a = await q.findOrCreateByDomain(u.id, 'stripe.com', 'Stripe')
    const b = await q.findOrCreateByDomain(u.id, 'stripe.com', 'Stripe Inc.')
    expect(a.id).toBe(b.id)
    expect(a.name).toBe('Stripe')
  })

  it('scopes strictly by userId', async () => {
    const u1 = await makeUser('a@x.com')
    const u2 = await makeUser('b@x.com')
    await q.findOrCreateByDomain(u1.id, 'stripe.com', 'Stripe')
    const list2 = await q.listWatched(u2.id)
    expect(list2).toEqual([])
  })

  it('listWatched returns only watched companies for the user', async () => {
    const u = await makeUser()
    const s = await q.findOrCreateByDomain(u.id, 'stripe.com', 'Stripe')
    await q.setWatched(u.id, s.id, true)
    await q.findOrCreateByDomain(u.id, 'notion.so', 'Notion')
    const watched = await q.listWatched(u.id)
    expect(watched.map((c) => c.domain)).toEqual(['stripe.com'])
  })

  it('getById returns row for owner, undefined for another user', async () => {
    const u1 = await makeUser('a@x.com')
    const u2 = await makeUser('b@x.com')
    const c = await q.findOrCreateByDomain(u1.id, 'stripe.com', 'Stripe')
    expect(await q.getById(u1.id, c.id)).toBeDefined()
    expect(await q.getById(u2.id, c.id)).toBeUndefined()
  })

  it('update patches fields and enforces userId scope', async () => {
    const u1 = await makeUser('a@x.com')
    const u2 = await makeUser('b@x.com')
    const c = await q.findOrCreateByDomain(u1.id, 'stripe.com', 'Stripe')
    const updated = await q.update(u1.id, c.id, { stance: 'target' })
    expect(updated?.stance).toBe('target')
    // wrong user cannot update
    const nope = await q.update(u2.id, c.id, { stance: 'passive' })
    expect(nope).toBeUndefined()
  })

  it('getWithApplicationsAndContacts bundles apps, jobs, and contacts', async () => {
    const u1 = await makeUser('owner@x.com')
    const u2 = await makeUser('other@x.com')
    const c = await q.findOrCreateByDomain(u1.id, 'stripe.com', 'Stripe')
    const j1 = await makeJob(u1.id, c.id, { title: 'Staff Engineer' })
    const j2 = await makeJob(u1.id, c.id, { title: 'Product Designer' })
    await makeApplication(u1.id, j1.id, { status: 'interview' })
    await makeContact(u1.id, { name: 'Alex', companyId: c.id, role: 'Recruiter' })

    const detail = await q.getWithApplicationsAndContacts(u1.id, c.id)
    expect(detail).toBeDefined()
    expect(detail!.company.id).toBe(c.id)
    expect(detail!.applications).toHaveLength(1)
    expect(detail!.applications[0]?.jobTitle).toBe('Staff Engineer')
    expect(detail!.jobs.map((j) => j.id).sort()).toEqual([j1.id, j2.id].sort())
    const j1Row = detail!.jobs.find((j) => j.id === j1.id)!
    const j2Row = detail!.jobs.find((j) => j.id === j2.id)!
    expect(j1Row.hasApplication).toBe(true)
    expect(j2Row.hasApplication).toBe(false)
    expect(detail!.contacts).toHaveLength(1)
    expect(detail!.contacts[0]?.name).toBe('Alex')

    // Wrong user cannot read.
    const fromOther = await q.getWithApplicationsAndContacts(u2.id, c.id)
    expect(fromOther).toBeUndefined()
  })

  it('remove deletes the company and returns true, false when not found', async () => {
    const u = await makeUser()
    const c = await q.findOrCreateByDomain(u.id, 'stripe.com', 'Stripe')
    expect(await q.remove(u.id, c.id)).toBe(true)
    expect(await q.getById(u.id, c.id)).toBeUndefined()
    expect(await q.remove(u.id, c.id)).toBe(false)
  })
})

describe('companies.listNames', () => {
  it('returns every company of the user, watched or not, and no one else', async () => {
    const u = await makeUser()
    const other = await makeUser()
    const watched = await makeCompany(u.id, { name: 'Watched', isWatched: true })
    const unwatched = await makeCompany(u.id, { name: 'Unwatched', isWatched: false })
    await makeCompany(other.id, { name: 'Theirs' })
    const rows = await q.listNames(u.id)
    expect(rows.map((r) => r.id).sort()).toEqual([watched.id, unwatched.id].sort())
  })
})
