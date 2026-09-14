import { db } from '@/lib/db/client'
import * as contactsQ from '@/lib/db/queries/contacts'
import * as appsQ from '@/lib/db/queries/applications'
import * as appContactsQ from '@/lib/db/queries/applicationContacts'
import * as actQ from '@/lib/db/queries/activities'
import type { Contact, NewContact } from '@/lib/db/queries/contacts'

export async function createContact(
  args: { userId: string } & Omit<NewContact, 'userId' | 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Contact> {
  const { userId, ...data } = args
  return contactsQ.create(userId, data)
}

export interface LinkArgs {
  userId: string
  applicationId: string
  contactId: string
  role: string
}

export async function linkContactToApplication(args: LinkArgs): Promise<void> {
  const { userId, applicationId, contactId, role } = args

  // Enforce scoping explicitly so cross-user attempts fail loudly rather than
  // silently no-op (the underlying query is idempotent + defensive).
  const [app, contact] = await Promise.all([
    appsQ.getById(userId, applicationId),
    contactsQ.getById(userId, contactId),
  ])
  if (!app) throw new Error('application not found')
  if (!contact) throw new Error('contact not found')

  await db.transaction(async (tx) => {
    await appContactsQ.link(userId, applicationId, contactId, role, tx)
    await actQ.log(userId, applicationId, 'contact_added', { contactId, role }, tx)
  })
}

export async function unlinkContactFromApplication(args: LinkArgs): Promise<void> {
  const { userId, applicationId, contactId, role } = args
  await db.transaction(async (tx) => {
    await appContactsQ.unlink(userId, applicationId, contactId, role, tx)
    await actQ.log(userId, applicationId, 'contact_removed', { contactId, role }, tx)
  })
}
