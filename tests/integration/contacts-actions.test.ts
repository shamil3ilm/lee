import { describe, it, expect, vi, beforeEach } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { activities, applicationContacts, applications, contacts, todos } from '@/lib/db/schema'
import {
  addContact,
  updateContact,
  deleteContact,
  linkContactAction,
  unlinkContactAction,
} from '@/app/(authed)/contacts/actions'
import {
  makeUser,
  makeCompany,
  makeContact,
  makeJob,
  makeApplication,
} from '@/tests/factories'

const sessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-session', () => ({ requireUserId: sessionMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

function fd(values: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(values)) f.set(k, v)
  return f
}

async function getContact(id: string) {
  const [row] = await db.select().from(contacts).where(eq(contacts.id, id))
  return row
}

beforeEach(() => {
  sessionMock.mockReset()
})

describe('addContact', () => {
  it('rejects a company that belongs to another user', async () => {
    const me = await makeUser()
    const other = await makeUser()
    const foreign = await makeCompany(other.id)
    sessionMock.mockResolvedValue(me.id)
    const r = await addContact(fd({ name: 'Ann', companyId: foreign.id }))
    expect(r).toEqual({ error: 'Company not found.' })
    const rows = await db.select().from(contacts).where(eq(contacts.userId, me.id))
    expect(rows).toHaveLength(0)
  })
})

describe('updateContact', () => {
  it('updates every editable field and clears blanks to null', async () => {
    const me = await makeUser()
    const co = await makeCompany(me.id)
    const c = await makeContact(me.id, { name: 'Old', email: 'old@x.com', phone: '1' })
    sessionMock.mockResolvedValue(me.id)

    const r = await updateContact(
      c.id,
      fd({
        name: 'New Name',
        role: 'Recruiter',
        email: 'new@x.com',
        phone: '',
        linkedinUrl: 'https://linkedin.com/in/new',
        companyId: co.id,
        notes: 'Met at a meetup',
      }),
    )
    expect(r).toEqual({ success: true })
    const row = await getContact(c.id)
    expect(row).toMatchObject({
      name: 'New Name',
      role: 'Recruiter',
      email: 'new@x.com',
      phone: null,
      linkedinUrl: 'https://linkedin.com/in/new',
      companyId: co.id,
      notes: 'Met at a meetup',
    })
  })

  it('rejects an empty name and an invalid email with a friendly message', async () => {
    const me = await makeUser()
    const c = await makeContact(me.id)
    sessionMock.mockResolvedValue(me.id)
    expect(await updateContact(c.id, fd({ name: '' }))).toEqual({ error: 'Name is required' })
    const bad = await updateContact(c.id, fd({ name: 'X', email: 'nope' }))
    expect('error' in bad).toBe(true)
  })

  it("cannot edit another user's contact", async () => {
    const me = await makeUser()
    const other = await makeUser()
    const theirs = await makeContact(other.id, { name: 'Theirs' })
    sessionMock.mockResolvedValue(me.id)
    const r = await updateContact(theirs.id, fd({ name: 'Hijacked' }))
    expect(r).toEqual({ error: 'Contact not found.' })
    expect((await getContact(theirs.id))?.name).toBe('Theirs')
  })

  it("cannot move a contact to another user's company", async () => {
    const me = await makeUser()
    const other = await makeUser()
    const foreign = await makeCompany(other.id)
    const c = await makeContact(me.id)
    sessionMock.mockResolvedValue(me.id)
    const r = await updateContact(c.id, fd({ name: 'X', companyId: foreign.id }))
    expect(r).toEqual({ error: 'Company not found.' })
    expect((await getContact(c.id))?.companyId).toBeNull()
  })

  it('rejects a non-uuid id', async () => {
    const me = await makeUser()
    sessionMock.mockResolvedValue(me.id)
    expect(await updateContact('not-a-uuid', fd({ name: 'X' }))).toEqual({
      error: 'Contact not found.',
    })
  })
})

describe('deleteContact', () => {
  it('deletes the contact, unlinks it from applications, keeps the application and todos', async () => {
    const me = await makeUser()
    const j = await makeJob(me.id, null)
    const a = await makeApplication(me.id, j.id)
    const c = await makeContact(me.id)
    await db.insert(applicationContacts).values({ applicationId: a.id, contactId: c.id, role: 'recruiter' })
    await db.update(applications).set({ referredByContactId: c.id }).where(eq(applications.id, a.id))
    const [t] = await db.insert(todos).values({ userId: me.id, title: 'Ping', contactId: c.id }).returning()
    sessionMock.mockResolvedValue(me.id)

    expect(await deleteContact(c.id)).toEqual({ success: true })
    expect(await getContact(c.id)).toBeUndefined()
    const links = await db.select().from(applicationContacts).where(eq(applicationContacts.contactId, c.id))
    expect(links).toHaveLength(0)
    const [app] = await db.select().from(applications).where(eq(applications.id, a.id))
    expect(app?.referredByContactId).toBeNull()
    const [todo] = await db.select().from(todos).where(eq(todos.id, t!.id))
    expect(todo?.contactId).toBeNull()
  })

  it("cannot delete another user's contact", async () => {
    const me = await makeUser()
    const other = await makeUser()
    const theirs = await makeContact(other.id)
    sessionMock.mockResolvedValue(me.id)
    expect(await deleteContact(theirs.id)).toEqual({ error: 'Contact not found.' })
    expect(await getContact(theirs.id)).toBeDefined()
  })
})

describe('linkContactAction / unlinkContactAction', () => {
  it('links and unlinks a contact with a role, logging activities', async () => {
    const me = await makeUser()
    const j = await makeJob(me.id, null)
    const a = await makeApplication(me.id, j.id)
    const c = await makeContact(me.id)
    sessionMock.mockResolvedValue(me.id)

    expect(await linkContactAction(a.id, c.id, 'recruiter')).toEqual({ success: true })
    const linked = await db
      .select()
      .from(applicationContacts)
      .where(and(eq(applicationContacts.applicationId, a.id), eq(applicationContacts.contactId, c.id)))
    expect(linked).toHaveLength(1)

    expect(await unlinkContactAction(a.id, c.id, 'recruiter')).toEqual({ success: true })
    const after = await db
      .select()
      .from(applicationContacts)
      .where(eq(applicationContacts.applicationId, a.id))
    expect(after).toHaveLength(0)
    const acts = await db.select().from(activities).where(eq(activities.applicationId, a.id))
    expect(acts.map((x) => x.kind).sort()).toEqual(['contact_added', 'contact_removed'])
  })

  it('rejects an unknown role', async () => {
    const me = await makeUser()
    const j = await makeJob(me.id, null)
    const a = await makeApplication(me.id, j.id)
    const c = await makeContact(me.id)
    sessionMock.mockResolvedValue(me.id)
    expect(await linkContactAction(a.id, c.id, 'overlord')).toEqual({ error: 'Pick a valid role.' })
  })

  it("cannot link another user's contact or application", async () => {
    const me = await makeUser()
    const other = await makeUser()
    const myJob = await makeJob(me.id, null)
    const myApp = await makeApplication(me.id, myJob.id)
    const myContact = await makeContact(me.id)
    const theirJob = await makeJob(other.id, null)
    const theirApp = await makeApplication(other.id, theirJob.id)
    const theirContact = await makeContact(other.id)
    sessionMock.mockResolvedValue(me.id)

    expect(await linkContactAction(myApp.id, theirContact.id, 'recruiter')).toEqual({
      error: 'Contact or application not found.',
    })
    expect(await linkContactAction(theirApp.id, myContact.id, 'recruiter')).toEqual({
      error: 'Contact or application not found.',
    })
    const rows = await db.select().from(applicationContacts)
    expect(rows).toHaveLength(0)
  })

  it("cannot unlink on another user's application (and logs nothing there)", async () => {
    const me = await makeUser()
    const other = await makeUser()
    const theirJob = await makeJob(other.id, null)
    const theirApp = await makeApplication(other.id, theirJob.id)
    const theirContact = await makeContact(other.id)
    await db
      .insert(applicationContacts)
      .values({ applicationId: theirApp.id, contactId: theirContact.id, role: 'recruiter' })
    sessionMock.mockResolvedValue(me.id)

    expect(await unlinkContactAction(theirApp.id, theirContact.id, 'recruiter')).toEqual({
      error: 'Contact or application not found.',
    })
    const rows = await db.select().from(applicationContacts)
    expect(rows).toHaveLength(1)
    const acts = await db.select().from(activities).where(eq(activities.applicationId, theirApp.id))
    expect(acts).toHaveLength(0)
  })
})
