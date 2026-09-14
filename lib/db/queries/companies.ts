import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { companies } from '@/lib/db/schema'

export type Company = typeof companies.$inferSelect
export type NewCompany = typeof companies.$inferInsert

export async function findOrCreateByDomain(
  userId: string,
  domain: string,
  name: string,
): Promise<Company> {
  const existing = await db.query.companies.findFirst({
    where: and(eq(companies.userId, userId), eq(companies.domain, domain)),
  })
  if (existing) return existing
  const [inserted] = await db
    .insert(companies)
    .values({ userId, domain, name })
    .returning()
  if (!inserted) throw new Error('failed to insert company')
  return inserted
}

export async function listWatched(userId: string): Promise<Company[]> {
  return db.query.companies.findMany({
    where: and(eq(companies.userId, userId), eq(companies.isWatched, true)),
    orderBy: (c, { asc }) => asc(c.name),
  })
}

export async function setWatched(
  userId: string,
  id: string,
  isWatched: boolean,
): Promise<void> {
  await db
    .update(companies)
    .set({ isWatched, updatedAt: new Date() })
    .where(and(eq(companies.userId, userId), eq(companies.id, id)))
}

export async function getById(userId: string, id: string): Promise<Company | undefined> {
  return db.query.companies.findFirst({
    where: and(eq(companies.userId, userId), eq(companies.id, id)),
  })
}

export async function update(
  userId: string,
  id: string,
  patch: Partial<NewCompany>,
): Promise<Company | undefined> {
  const [updated] = await db
    .update(companies)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(companies.userId, userId), eq(companies.id, id)))
    .returning()
  return updated
}
