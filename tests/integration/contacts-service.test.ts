import { describe, it, expect } from 'vitest'
import { and, eq } from 'drizzle-orm'
import {
  createContact,
  linkContactToApplication,
  unlinkContactFromApplication,
} from '@/lib/contacts/service'
import {
  makeUser,
  makeCompany,
  makeContact,
  makeJob,
  makeApplication,
} from '@/tests/factories'
import { db } from '@/lib/db/client'
import { activities, applicationContacts } from '@/lib/db/schema'

describe('createContact', () => {
  it('creates a contact scoped to the user', async () => {
    const u = await makeUser()
    const contact = await createContact({
      userId: u.id,
      name: 'Alice Recruiter',
      email: 'alice@acme.com',
    })
    expect(contact.userId).toBe(u.id)
    expect(contact.name).toBe('Alice Recruiter')
  })
})

describe('linkContactToApplication', () => {
  it('links contact and writes activity', async () => {
    const u = await makeUser()
    const c = await makeCompany(u.id)
    const contact = await makeContact(u.id, { companyId: c.id })
    const j = await makeJob(u.id, c.id)
    const a = await makeApplication(u.id, j.id)

    await linkContactToApplication({
      userId: u.id,
      applicationId: a.id,
      contactId: contact.id,
      role: 'recruiter',
    })

    const links = await db
      .select()
      .from(applicationContacts)
      .where(
        and(
          eq(applicationContacts.applicationId, a.id),
          eq(applicationContacts.contactId, contact.id),
        ),
      )
    expect(links).toHaveLength(1)

    const acts = await db.select().from(activities).where(eq(activities.applicationId, a.id))
    expect(acts.some((x) => x.kind === 'contact_added')).toBe(true)
  })

  it('is idempotent for the same (application, contact, role)', async () => {
    const u = await makeUser()
    const c = await makeCompany(u.id)
    const contact = await makeContact(u.id, { companyId: c.id })
    const j = await makeJob(u.id, c.id)
    const a = await makeApplication(u.id, j.id)

    await linkContactToApplication({
      userId: u.id,
      applicationId: a.id,
      contactId: contact.id,
      role: 'recruiter',
    })
    await linkContactToApplication({
      userId: u.id,
      applicationId: a.id,
      contactId: contact.id,
      role: 'recruiter',
    })

    const links = await db
      .select()
      .from(applicationContacts)
      .where(eq(applicationContacts.applicationId, a.id))
    expect(links).toHaveLength(1)
  })

  it('rejects cross-user linking', async () => {
    const u1 = await makeUser()
    const u2 = await makeUser()
    const c = await makeCompany(u1.id)
    const j = await makeJob(u1.id, c.id)
    const a = await makeApplication(u1.id, j.id)
    const otherContact = await makeContact(u2.id)

    await expect(
      linkContactToApplication({
        userId: u1.id,
        applicationId: a.id,
        contactId: otherContact.id,
        role: 'recruiter',
      }),
    ).rejects.toThrow()
  })
})

describe('unlinkContactFromApplication', () => {
  it('removes link and writes activity', async () => {
    const u = await makeUser()
    const c = await makeCompany(u.id)
    const contact = await makeContact(u.id, { companyId: c.id })
    const j = await makeJob(u.id, c.id)
    const a = await makeApplication(u.id, j.id)

    await linkContactToApplication({
      userId: u.id,
      applicationId: a.id,
      contactId: contact.id,
      role: 'recruiter',
    })
    await unlinkContactFromApplication({
      userId: u.id,
      applicationId: a.id,
      contactId: contact.id,
      role: 'recruiter',
    })

    const links = await db
      .select()
      .from(applicationContacts)
      .where(eq(applicationContacts.applicationId, a.id))
    expect(links).toHaveLength(0)

    const acts = await db.select().from(activities).where(eq(activities.applicationId, a.id))
    expect(acts.some((x) => x.kind === 'contact_removed')).toBe(true)
  })
})
