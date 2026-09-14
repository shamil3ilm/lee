import { describe, it, expect } from 'vitest'
import * as q from '@/lib/db/queries/applicationContacts'
import * as applications from '@/lib/db/queries/applications'
import * as contacts from '@/lib/db/queries/contacts'
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
  const c1 = await contacts.create(u.id, { companyId: co.id, name: 'Alice' })
  const c2 = await contacts.create(u.id, { companyId: co.id, name: 'Bob' })
  return { u, app, c1, c2 }
}

describe('application_contacts queries', () => {
  it('link inserts a row and is idempotent for the same (app, contact, role)', async () => {
    const { u, app, c1 } = await seed()
    await q.link(u.id, app.id, c1.id, 'recruiter')
    await q.link(u.id, app.id, c1.id, 'recruiter') // no throw, no dup
    const list = await q.listForApplication(u.id, app.id)
    expect(list).toHaveLength(1)
    expect(list[0]?.name).toBe('Alice')
    expect(list[0]?.role).toBe('recruiter')
  })

  it('link allows the same contact under a different role', async () => {
    const { u, app, c1 } = await seed()
    await q.link(u.id, app.id, c1.id, 'recruiter')
    await q.link(u.id, app.id, c1.id, 'referrer')
    const list = await q.listForApplication(u.id, app.id)
    expect(list.map((r) => r.role).sort()).toEqual(['recruiter', 'referrer'])
  })

  it('unlink removes the specific role', async () => {
    const { u, app, c1 } = await seed()
    await q.link(u.id, app.id, c1.id, 'recruiter')
    await q.link(u.id, app.id, c1.id, 'referrer')
    await q.unlink(u.id, app.id, c1.id, 'recruiter')
    const list = await q.listForApplication(u.id, app.id)
    expect(list.map((r) => r.role)).toEqual(['referrer'])
  })

  it('listForApplication returns empty for a different user', async () => {
    const { u, app, c1 } = await seed()
    await q.link(u.id, app.id, c1.id, 'recruiter')
    const other = await makeUser('other@x.com')
    const list = await q.listForApplication(other.id, app.id)
    expect(list).toEqual([])
  })

  it('link is a no-op when application does not belong to userId', async () => {
    const { app, c1 } = await seed()
    const other = await makeUser('other@x.com')
    await q.link(other.id, app.id, c1.id, 'recruiter')
    // scoped list for real owner remains empty
    const list = await q.listForApplication(other.id, app.id)
    expect(list).toEqual([])
  })
})
