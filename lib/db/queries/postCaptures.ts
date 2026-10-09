import { and, desc, eq, gt, lte, notInArray, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { captureKeys, postCaptures } from '@/lib/db/schema'

/**
 * "Send to lee" captures and the bookmarklet key version. Every function is
 * userId-scoped; captures are short-lived and capped per user.
 */

export type PostCapture = typeof postCaptures.$inferSelect

/** Pending captures kept per user; older ones are dropped on insert. */
export const MAX_PENDING_CAPTURES = 5

export async function create(
  userId: string,
  input: { text: string; url: string | null; expiresAt: Date },
  client: DbClient = db,
): Promise<PostCapture> {
  const [row] = await client.insert(postCaptures).values({ userId, ...input }).returning()
  if (!row) throw new Error('post_captures insert returned no row')
  const keep = await client
    .select({ id: postCaptures.id })
    .from(postCaptures)
    .where(eq(postCaptures.userId, userId))
    .orderBy(desc(postCaptures.createdAt), desc(postCaptures.id))
    .limit(MAX_PENDING_CAPTURES)
  await client.delete(postCaptures).where(
    and(
      eq(postCaptures.userId, userId),
      notInArray(
        postCaptures.id,
        keep.map((k) => k.id),
      ),
    ),
  )
  return row
}

/** The newest capture that has not expired, or null. Expired rows are removed. */
export async function latestPending(userId: string, now: Date = new Date(), client: DbClient = db): Promise<PostCapture | null> {
  await client.delete(postCaptures).where(and(eq(postCaptures.userId, userId), lte(postCaptures.expiresAt, now)))
  const [row] = await client
    .select()
    .from(postCaptures)
    .where(and(eq(postCaptures.userId, userId), gt(postCaptures.expiresAt, now)))
    .orderBy(desc(postCaptures.createdAt), desc(postCaptures.id))
    .limit(1)
  return row ?? null
}

export async function remove(userId: string, id: string, client: DbClient = db): Promise<boolean> {
  const rows = await client
    .delete(postCaptures)
    .where(and(eq(postCaptures.userId, userId), eq(postCaptures.id, id)))
    .returning()
  return rows.length > 0
}

/** The user's bookmarklet key version (1 until rotated). */
export async function keyVersion(userId: string, client: DbClient = db): Promise<number> {
  const [row] = await client.select({ v: captureKeys.version }).from(captureKeys).where(eq(captureKeys.userId, userId)).limit(1)
  return row?.v ?? 1
}

/** Bump the version: every bookmarklet made with an older key stops working. */
export async function rotateKey(userId: string, client: DbClient = db): Promise<number> {
  const [row] = await client
    .insert(captureKeys)
    .values({ userId, version: 2 })
    .onConflictDoUpdate({ target: captureKeys.userId, set: { version: sql`${captureKeys.version} + 1`, rotatedAt: sql`now()` } })
    .returning()
  return row?.version ?? 2
}
