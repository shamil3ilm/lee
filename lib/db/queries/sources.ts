import { and, eq } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { sources } from '@/lib/db/schema'

export type Source = typeof sources.$inferSelect
export type NewSource = typeof sources.$inferInsert

export async function list(
  userId: string,
  opts: { enabled?: boolean } = {},
  client: DbClient = db,
): Promise<Source[]> {
  const where =
    opts.enabled === undefined
      ? eq(sources.userId, userId)
      : and(eq(sources.userId, userId), eq(sources.enabled, opts.enabled))
  return client.query.sources.findMany({
    where,
    orderBy: (s, { asc }) => asc(s.createdAt),
  })
}

export async function getById(
  userId: string,
  id: string,
  client: DbClient = db,
): Promise<Source | undefined> {
  return client.query.sources.findFirst({
    where: and(eq(sources.userId, userId), eq(sources.id, id)),
  })
}

export async function create(
  userId: string,
  data: Omit<NewSource, 'id' | 'userId' | 'createdAt'>,
  client: DbClient = db,
): Promise<Source> {
  const [row] = await client.insert(sources).values({ ...data, userId }).returning()
  if (!row) throw new Error('failed to insert source')
  return row
}

export async function update(
  userId: string,
  id: string,
  patch: Partial<NewSource>,
  client: DbClient = db,
): Promise<Source | undefined> {
  const [row] = await client
    .update(sources)
    .set(patch)
    .where(and(eq(sources.userId, userId), eq(sources.id, id)))
    .returning()
  return row
}

export async function remove(
  userId: string,
  id: string,
  client: DbClient = db,
): Promise<boolean> {
  const rows = await client
    .delete(sources)
    .where(and(eq(sources.userId, userId), eq(sources.id, id)))
    .returning()
  return rows.length > 0
}

/**
 * Record the outcome of a poll cycle for a source. On success (no error), we
 * clear lastError and reset errorCount so a source that recovers isn't stuck
 * at a stale count. On failure, we increment errorCount so the service layer
 * can auto-skip persistently-broken sources.
 */
export async function setPolled(
  userId: string,
  id: string,
  error?: string,
  client: DbClient = db,
): Promise<void> {
  if (!error) {
    await client
      .update(sources)
      .set({ lastPolledAt: new Date(), lastError: null, errorCount: 0 })
      .where(and(eq(sources.userId, userId), eq(sources.id, id)))
    return
  }
  const existing = await client.query.sources.findFirst({
    where: and(eq(sources.userId, userId), eq(sources.id, id)),
  })
  const nextCount = (existing?.errorCount ?? 0) + 1
  await client
    .update(sources)
    .set({ lastPolledAt: new Date(), lastError: error.slice(0, 500), errorCount: nextCount })
    .where(and(eq(sources.userId, userId), eq(sources.id, id)))
}
