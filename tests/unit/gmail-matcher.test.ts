import { describe, it, expect } from 'vitest'
import { matchThreadToApplication } from '@/lib/gmail/matcher'
import type { GmailThreadFull } from '@/lib/gmail/adapter'
import * as applications from '@/lib/db/queries/applications'
import * as applicationContacts from '@/lib/db/queries/applicationContacts'
import * as contactsQ from '@/lib/db/queries/contacts'
import * as companies from '@/lib/db/queries/companies'
import * as jobs from '@/lib/db/queries/jobs'
import { makeUser } from '@/tests/factories'

function thread(headers: Array<Array<[string, string]>>): GmailThreadFull {
  return {
    id: 't1',
    messages: headers.map((h, i) => ({
      id: `m${i}`,
      threadId: 't1',
      snippet: '',
      internalDate: String(1700000000000 + i),
      payload: { headers: h.map(([name, value]) => ({ name, value })) },
    })),
  }
}

describe('matchThreadToApplication', () => {
  it('rule 1 — contact email match wins over domain', async () => {
    const u = await makeUser('m1@x.com')
    const co = await companies.findOrCreateByDomain(u.id, 'acme.com', 'Acme')
    const jobA = await jobs.upsertBySourceUrl(u.id, co.id, {
      title: 'Backend',
      sourceUrl: 'https://acme.com/j/1',
    })
    const jobB = await jobs.upsertBySourceUrl(u.id, co.id, {
      title: 'Frontend',
      sourceUrl: 'https://acme.com/j/2',
    })
    const appA = await applications.create(u.id, { jobId: jobA.id })
    await applications.create(u.id, { jobId: jobB.id })

    // Contact linked only to appA — thread from that contact must resolve to appA.
    const contact = await contactsQ.create(u.id, {
      companyId: co.id,
      name: 'Rae Recruiter',
      email: 'rae@Acme.com',
    })
    await applicationContacts.link(u.id, appA.id, contact.id, 'recruiter')

    const t = thread([[['From', 'Rae Recruiter <rae@ACME.com>'], ['Subject', 'hello']]])
    const match = await matchThreadToApplication({ thread: t, userId: u.id })
    expect(match).toEqual({ applicationId: appA.id, reason: 'contact_email_match' })
  })

  it('rule 2 — sender domain matches a company with an application', async () => {
    const u = await makeUser('m2@x.com')
    const co = await companies.findOrCreateByDomain(u.id, 'stripe.com', 'Stripe')
    const j = await jobs.upsertBySourceUrl(u.id, co.id, {
      title: 'SWE',
      sourceUrl: 'https://stripe.com/j/1',
    })
    const app = await applications.create(u.id, { jobId: j.id })

    const t = thread([[['From', 'Stripe Careers <careers@stripe.com>'], ['Subject', 'update']]])
    const match = await matchThreadToApplication({ thread: t, userId: u.id })
    expect(match).toEqual({ applicationId: app.id, reason: 'company_domain_match' })
  })

  it('rule 3 — subject substring match against a job title', async () => {
    const u = await makeUser('m3@x.com')
    const co = await companies.findOrCreateByDomain(u.id, 'foo.com', 'Foo')
    const j = await jobs.upsertBySourceUrl(u.id, co.id, {
      title: 'Senior Platform Engineer',
      sourceUrl: 'https://foo.com/j/1',
    })
    const app = await applications.create(u.id, { jobId: j.id })

    // From is unrelated — must fall through to rule 3.
    const t = thread([
      [
        ['From', 'random@somewhere.net'],
        ['Subject', 'RE: Your application for Senior Platform Engineer at Foo'],
      ],
    ])
    const match = await matchThreadToApplication({ thread: t, userId: u.id })
    expect(match).toEqual({ applicationId: app.id, reason: 'subject_title_match' })
  })

  it('returns null when nothing matches', async () => {
    const u = await makeUser('m4@x.com')
    await companies.findOrCreateByDomain(u.id, 'foo.com', 'Foo')
    const t = thread([[['From', 'noone@nowhere.com'], ['Subject', 'random']]])
    expect(await matchThreadToApplication({ thread: t, userId: u.id })).toBeNull()
  })

  it('scopes matches to the requesting user', async () => {
    const other = await makeUser('m5-other@x.com')
    const co = await companies.findOrCreateByDomain(other.id, 'foo.com', 'Foo')
    const j = await jobs.upsertBySourceUrl(other.id, co.id, {
      title: 'SWE',
      sourceUrl: 'https://foo.com/j/1',
    })
    await applications.create(other.id, { jobId: j.id })

    const me = await makeUser('m5-me@x.com')
    const t = thread([[['From', 'careers@foo.com'], ['Subject', 'hi']]])
    // Other user matches — mine should NOT.
    expect(await matchThreadToApplication({ thread: t, userId: me.id })).toBeNull()
  })

  it('ignores rejected/withdrawn applications for domain match (rule 2)', async () => {
    const u = await makeUser('m6@x.com')
    const co = await companies.findOrCreateByDomain(u.id, 'dead.com', 'Dead')
    const j = await jobs.upsertBySourceUrl(u.id, co.id, {
      title: 'SWE',
      sourceUrl: 'https://dead.com/j/1',
    })
    await applications.create(u.id, { jobId: j.id, status: 'rejected' })
    const t = thread([[['From', 'careers@dead.com'], ['Subject', 'hi']]])
    expect(await matchThreadToApplication({ thread: t, userId: u.id })).toBeNull()
  })

  it('empty thread returns null', async () => {
    const u = await makeUser('m7@x.com')
    const t: GmailThreadFull = { id: 't1', messages: [] }
    expect(await matchThreadToApplication({ thread: t, userId: u.id })).toBeNull()
  })
})
