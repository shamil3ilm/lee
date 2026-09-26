import { and, asc, eq } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { scamAllowList } from '@/lib/db/schema'

/** v17 §1 — per-user Scam Shield allow-list ("not a scam" memory). */

export type AllowListEntry = typeof scamAllowList.$inferSelect
export type AllowListKind = 'domain' | 'company'

export async function list(userId: string, client: DbClient = db): Promise<AllowListEntry[]> {
  return client
    .select()
    .from(scamAllowList)
    .where(eq(scamAllowList.userId, userId))
    .orderBy(asc(scamAllowList.kind), asc(scamAllowList.value))
}

export async function add(
  userId: string,
  kind: AllowListKind,
  value: string,
  client: DbClient = db,
): Promise<void> {
  await client.insert(scamAllowList).values({ userId, kind, value }).onConflictDoNothing()
}

export async function remove(userId: string, id: string, client: DbClient = db): Promise<boolean> {
  const rows = await client
    .delete(scamAllowList)
    .where(and(eq(scamAllowList.userId, userId), eq(scamAllowList.id, id)))
    .returning()
  return rows.length > 0
}
