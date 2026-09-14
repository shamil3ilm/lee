import { and, eq } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { companies } from '@/lib/db/schema'

export type Company = typeof companies.$inferSelect
export type NewCompany = typeof companies.$inferInsert

/**
 * Atomic upsert: try to INSERT the (userId, domain) row; if the unique
 * constraint blocks it, fall back to reading the pre-existing row. Eliminates
 * the read-then-insert race in the previous implementation.
 */
export async function findOrCreateByDomain(
  userId: string,
  domain: string,
  name: string,
  client: DbClient = db,
): Promise<Company> {
  const [inserted] = await client
    .insert(companies)
    .values({ userId, domain, name })
    .onConflictDoNothing({ target: [companies.userId, companies.domain] })
    .returning()
  if (inserted) return inserted
  const existing = await client.query.companies.findFirst({
    where: and(eq(companies.userId, userId), eq(companies.domain, domain)),
  })
  if (!existing) throw new Error('findOrCreateByDomain: could not create or find')
  return existing
}

export async function listWatched(userId: string, client: DbClient = db): Promise<Company[]> {
  return client.query.companies.findMany({
    where: and(eq(companies.userId, userId), eq(companies.isWatched, true)),
    orderBy: (c, { asc }) => asc(c.name),
  })
}

export async function setWatched(
  userId: string,
  id: string,
  isWatched: boolean,
  client: DbClient = db,
): Promise<void> {
  await client
    .update(companies)
    .set({ isWatched, updatedAt: new Date() })
    .where(and(eq(companies.userId, userId), eq(companies.id, id)))
}

export async function getById(
  userId: string,
  id: string,
  client: DbClient = db,
): Promise<Company | undefined> {
  return client.query.companies.findFirst({
    where: and(eq(companies.userId, userId), eq(companies.id, id)),
  })
}

export async function update(
  userId: string,
  id: string,
  patch: Partial<NewCompany>,
  client: DbClient = db,
): Promise<Company | undefined> {
  const [updated] = await client
    .update(companies)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(companies.userId, userId), eq(companies.id, id)))
    .returning()
  return updated
}
