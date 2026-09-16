import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { documents } from '@/lib/db/schema'

export type Document = typeof documents.$inferSelect
export type NewDocument = typeof documents.$inferInsert
export type DocumentKind = 'master_cv' | 'tailored_cv' | 'cover_letter'

export interface ListOptions {
  applicationId?: string
  kind?: DocumentKind
}

export async function create(
  userId: string,
  data: Omit<NewDocument, 'userId' | 'id' | 'createdAt' | 'updatedAt'>,
  client: DbClient = db,
): Promise<Document> {
  const [row] = await client
    .insert(documents)
    .values({ ...data, userId })
    .returning()
  if (!row) throw new Error('failed to insert document')
  return row
}

export async function list(
  userId: string,
  opts: ListOptions = {},
  client: DbClient = db,
): Promise<Document[]> {
  const filters = [eq(documents.userId, userId)]
  if (opts.applicationId !== undefined) {
    filters.push(eq(documents.applicationId, opts.applicationId))
  }
  if (opts.kind) filters.push(eq(documents.kind, opts.kind))
  return client
    .select()
    .from(documents)
    .where(and(...filters))
    .orderBy(desc(documents.createdAt))
}

export async function getById(
  userId: string,
  id: string,
  client: DbClient = db,
): Promise<Document | null> {
  const [row] = await client
    .select()
    .from(documents)
    .where(and(eq(documents.userId, userId), eq(documents.id, id)))
    .limit(1)
  return row ?? null
}

export async function update(
  userId: string,
  id: string,
  patch: Partial<Omit<NewDocument, 'id' | 'userId' | 'createdAt'>>,
  client: DbClient = db,
): Promise<Document | null> {
  const [row] = await client
    .update(documents)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(documents.userId, userId), eq(documents.id, id)))
    .returning()
  return row ?? null
}

export async function remove(userId: string, id: string, client: DbClient = db): Promise<void> {
  await client.delete(documents).where(and(eq(documents.userId, userId), eq(documents.id, id)))
}

/**
 * Returns the next version number for (userId, applicationId, kind). For the
 * master CV, `applicationId` should be null. Uses max(version)+1 so concurrent
 * writes are only best-effort ordered — good enough for a single-user tracker.
 */
export async function nextVersion(
  userId: string,
  applicationId: string | null,
  kind: DocumentKind,
  client: DbClient = db,
): Promise<number> {
  const appFilter = applicationId === null
    ? isNull(documents.applicationId)
    : eq(documents.applicationId, applicationId)
  const [row] = await client
    .select({ max: sql<number | null>`max(${documents.version})` })
    .from(documents)
    .where(and(eq(documents.userId, userId), appFilter, eq(documents.kind, kind)))
  const max = row?.max ?? 0
  return max + 1
}
