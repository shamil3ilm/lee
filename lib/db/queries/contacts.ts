import { and, asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { contacts } from '@/lib/db/schema'

export type Contact = typeof contacts.$inferSelect
export type NewContact = typeof contacts.$inferInsert

export async function create(
  userId: string,
  data: Omit<NewContact, 'userId' | 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Contact> {
  const [row] = await db
    .insert(contacts)
    .values({ ...data, userId })
    .returning()
  if (!row) throw new Error('failed to insert contact')
  return row
}

export async function list(
  userId: string,
  filters: { companyId?: string } = {},
): Promise<Contact[]> {
  const where = filters.companyId
    ? and(eq(contacts.userId, userId), eq(contacts.companyId, filters.companyId))
    : eq(contacts.userId, userId)
  return db.query.contacts.findMany({
    where,
    orderBy: (c, { asc }) => asc(c.name),
  })
}

/** id + name of every contact, for pickers (lean: no notes/phone/etc). */
export async function listOptions(userId: string): Promise<Array<{ id: string; name: string }>> {
  return db
    .select({ id: contacts.id, name: contacts.name })
    .from(contacts)
    .where(eq(contacts.userId, userId))
    .orderBy(asc(contacts.name))
}

export async function getById(userId: string, id: string): Promise<Contact | undefined> {
  return db.query.contacts.findFirst({
    where: and(eq(contacts.userId, userId), eq(contacts.id, id)),
  })
}

export async function update(
  userId: string,
  id: string,
  patch: Partial<NewContact>,
): Promise<Contact | undefined> {
  const [row] = await db
    .update(contacts)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(contacts.userId, userId), eq(contacts.id, id)))
    .returning()
  return row
}

export async function remove(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(contacts)
    .where(and(eq(contacts.userId, userId), eq(contacts.id, id)))
    .returning()
  return rows.length > 0
}
