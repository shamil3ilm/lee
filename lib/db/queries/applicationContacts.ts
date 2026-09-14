import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { applicationContacts, applications, contacts } from '@/lib/db/schema'

export type ApplicationContact = typeof applicationContacts.$inferSelect
export type Contact = typeof contacts.$inferSelect

/**
 * Link a contact to an application under a specific role.
 * Idempotent: composite PK (applicationId, contactId, role) makes duplicate
 * links a no-op. Ownership is enforced by requiring both the application and
 * the contact to belong to `userId`.
 */
export async function link(
  userId: string,
  applicationId: string,
  contactId: string,
  role: string,
): Promise<void> {
  // Verify both application and contact belong to the caller before linking.
  const [app, contact] = await Promise.all([
    db.query.applications.findFirst({
      where: and(eq(applications.userId, userId), eq(applications.id, applicationId)),
    }),
    db.query.contacts.findFirst({
      where: and(eq(contacts.userId, userId), eq(contacts.id, contactId)),
    }),
  ])
  if (!app || !contact) return

  await db
    .insert(applicationContacts)
    .values({ applicationId, contactId, role })
    .onConflictDoNothing({
      target: [applicationContacts.applicationId, applicationContacts.contactId, applicationContacts.role],
    })
}

/**
 * Remove the (application, contact, role) link. No-op if the application does
 * not belong to `userId`.
 */
export async function unlink(
  userId: string,
  applicationId: string,
  contactId: string,
  role: string,
): Promise<void> {
  const app = await db.query.applications.findFirst({
    where: and(eq(applications.userId, userId), eq(applications.id, applicationId)),
  })
  if (!app) return

  await db
    .delete(applicationContacts)
    .where(
      and(
        eq(applicationContacts.applicationId, applicationId),
        eq(applicationContacts.contactId, contactId),
        eq(applicationContacts.role, role),
      ),
    )
}

/**
 * List contacts linked to a given application, tagged with the role from the
 * join row. Empty array when the application does not belong to `userId`.
 */
export async function listForApplication(
  userId: string,
  applicationId: string,
): Promise<(Contact & { role: string })[]> {
  const app = await db.query.applications.findFirst({
    where: and(eq(applications.userId, userId), eq(applications.id, applicationId)),
  })
  if (!app) return []

  const rows = await db
    .select({ contact: contacts, linkRole: applicationContacts.role })
    .from(applicationContacts)
    .innerJoin(contacts, eq(applicationContacts.contactId, contacts.id))
    .where(eq(applicationContacts.applicationId, applicationId))

  // The join's `role` (recruiter/referrer/etc.) intentionally shadows the
  // contact's own `role` (job title). This matches the caller's expectation
  // that `.role` on the returned rows is the LINK role.
  return rows.map((r) => ({ ...r.contact, role: r.linkRole }))
}
