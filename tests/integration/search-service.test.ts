import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db/client'
import { discoveries, sources } from '@/lib/db/schema'
import { search } from '@/lib/search/service'
import {
  makeApplication,
  makeCompany,
  makeContact,
  makeJob,
  makeUser,
} from '@/tests/factories'

describe('search service', () => {
  it('returns empty result for queries shorter than 2 chars', async () => {
    const u = await makeUser('search-empty@x.com')
    const r = await search(u.id, '')
    expect(r.applications).toEqual([])
    expect(r.companies).toEqual([])
    expect(r.contacts).toEqual([])
    expect(r.discoveries).toEqual([])
  })

  it('finds matches across applications, companies, contacts, discoveries', async () => {
    const u = await makeUser('search-a@x.com')
    const c = await makeCompany(u.id, { name: 'Stripe', domain: 'stripe.com' })
    const j = await makeJob(u.id, c.id, { title: 'Senior Payments Engineer' })
    const app = await makeApplication(u.id, j.id, { status: 'applied' })
    const contact = await makeContact(u.id, {
      name: 'Payments Recruiter',
      email: 'recruit@stripe.com',
    })

    const [src] = await db
      .insert(sources)
      .values({ userId: u.id, name: 'HN', kind: 'hn', config: {} })
      .returning()
    if (!src) throw new Error('no source')
    await db.insert(discoveries).values({
      userId: u.id,
      sourceId: src.id,
      sourceJobId: 'hn-1',
      raw: {},
      normalized: { title: 'Payments Platform Engineer', companyName: 'Adyen' },
      status: 'new',
    })

    const r = await search(u.id, 'payments')

    expect(r.applications.map((h) => h.id)).toContain(app.id)
    expect(r.contacts.map((h) => h.id)).toContain(contact.id)
    expect(r.discoveries[0]?.title).toBe('Payments Platform Engineer')

    const r2 = await search(u.id, 'stripe')
    expect(r2.companies.map((h) => h.title)).toContain('Stripe')
    // Application also matches via company join.
    expect(r2.applications.map((h) => h.id)).toContain(app.id)
  })

  it('scopes strictly by userId', async () => {
    const u1 = await makeUser('search-scope-1@x.com')
    const u2 = await makeUser('search-scope-2@x.com')
    const c = await makeCompany(u2.id, { name: 'Confidential Corp' })
    const j = await makeJob(u2.id, c.id, { title: 'Secret Engineer' })
    await makeApplication(u2.id, j.id)

    const r = await search(u1.id, 'confidential')
    expect(r.companies).toHaveLength(0)
    expect(r.applications).toHaveLength(0)
  })

  it('caps each kind at 5 results', async () => {
    const u = await makeUser('search-cap@x.com')
    for (let i = 0; i < 8; i += 1) {
      const c = await makeCompany(u.id, {
        name: `TargetCo${i}`,
        domain: `target-${i}.example`,
      })
      const j = await makeJob(u.id, c.id, { title: `Target Role ${i}` })
      await makeApplication(u.id, j.id)
    }
    const r = await search(u.id, 'target')
    expect(r.applications.length).toBeLessThanOrEqual(5)
    expect(r.companies.length).toBeLessThanOrEqual(5)
  })
})

