import { db } from '@/lib/db/client'
import * as contactsQ from '@/lib/db/queries/contacts'
import * as companiesQ from '@/lib/db/queries/companies'
import * as appsQ from '@/lib/db/queries/applications'
import * as appContactsQ from '@/lib/db/queries/applicationContacts'
import * as actQ from '@/lib/db/queries/activities'
import type { Contact, NewContact } from '@/lib/db/queries/contacts'

/** Thrown when a referenced row is missing or belongs to another user. */
export class ContactScopeError extends Error {
  constructor(readonly what: 'company' | 'contact' | 'application') {
    super(`${what} not found`)
    this.name = 'ContactScopeError'
  }
}

type EditableContact = Omit<NewContact, 'userId' | 'id' | 'createdAt' | 'updatedAt'>

async function assertCompanyOwned(userId: string, companyId: string | null | undefined): Promise<void> {
  if (!companyId) return
  const company = await companiesQ.getById(userId, companyId)
  if (!company) throw new ContactScopeError('company')
}

export async function createContact(
  args: { userId: string } & EditableContact,
): Promise<Contact> {
  const { userId, ...data } = args
  await assertCompanyOwned(userId, data.companyId)
  return contactsQ.create(userId, data)
}

/**
 * Patch a contact. Returns undefined when the contact is not the caller's;
 * throws ContactScopeError('company') when the target company is foreign.
 */
export async function updateContact(
  userId: string,
  id: string,
  patch: Partial<EditableContact>,
): Promise<Contact | undefined> {
  await assertCompanyOwned(userId, patch.companyId)
  return contactsQ.update(userId, id, patch)
}

/**
 * Delete a contact. Links to applications go with it (FK cascade on
 * application_contacts); `applications.referred_by_contact_id` and
 * `todos.contact_id` are set null, so applications and todos survive.
 */
export async function deleteContact(userId: string, id: string): Promise<boolean> {
  return contactsQ.remove(userId, id)
}

export interface LinkArgs {
  userId: string
  applicationId: string
  contactId: string
  role: string
}

async function assertLinkScope(userId: string, applicationId: string, contactId: string): Promise<void> {
  // Enforce scoping explicitly so cross-user attempts fail loudly rather than
  // silently no-op (the underlying query is idempotent + defensive).
  const [app, contact] = await Promise.all([
    appsQ.getById(userId, applicationId),
    contactsQ.getById(userId, contactId),
  ])
  if (!app) throw new ContactScopeError('application')
  if (!contact) throw new ContactScopeError('contact')
}

export async function linkContactToApplication(args: LinkArgs): Promise<void> {
  const { userId, applicationId, contactId, role } = args
  await assertLinkScope(userId, applicationId, contactId)
  await db.transaction(async (tx) => {
    await appContactsQ.link(userId, applicationId, contactId, role, tx)
    await actQ.log(userId, applicationId, 'contact_added', { contactId, role }, tx)
  })
}

export async function unlinkContactFromApplication(args: LinkArgs): Promise<void> {
  const { userId, applicationId, contactId, role } = args
  // Without this check an activity row would be written against another
  // user's application id even though the unlink itself no-ops.
  await assertLinkScope(userId, applicationId, contactId)
  await db.transaction(async (tx) => {
    await appContactsQ.unlink(userId, applicationId, contactId, role, tx)
    await actQ.log(userId, applicationId, 'contact_removed', { contactId, role }, tx)
  })
}
