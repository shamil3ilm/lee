import { and, desc, eq, lt, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { linkedinPostMessages } from '@/lib/db/schema'

/**
 * LinkedIn notification emails the `linkedin_post` source read: counters and
 * parser health only (never the body). Every function is userId-scoped.
 */

export interface PostMessageRow {
  messageId: string
  kind: string
  receivedAt: Date
  postsFound: number
  hiringFound: number
  parseFailed: boolean
}

/** Upsert one row per message (re-reading a message refreshes its counts). */
export async function record(userId: string, rows: readonly PostMessageRow[], client: DbClient = db): Promise<void> {
  if (rows.length === 0) return
  await client
    .insert(linkedinPostMessages)
    .values(rows.map((r) => ({ userId, ...r })))
    .onConflictDoUpdate({
      target: [linkedinPostMessages.userId, linkedinPostMessages.messageId],
      set: {
        kind: sql`excluded.kind`,
        postsFound: sql`excluded.posts_found`,
        hiringFound: sql`excluded.hiring_found`,
        parseFailed: sql`excluded.parse_failed`,
        processedAt: sql`now()`,
      },
    })
}

export interface PostMessageSummary {
  emails: number
  posts: number
  hiring: number
  failed: number
  lastEmailAt: Date | null
  lastReadAt: Date | null
}

/** Totals over the kept window (≤ 120 days) for Settings › LinkedIn. */
export async function summary(userId: string, client: DbClient = db): Promise<PostMessageSummary> {
  const [row] = await client
    .select({
      emails: sql<number>`count(*)::int`,
      posts: sql<number>`coalesce(sum(${linkedinPostMessages.postsFound}), 0)::int`,
      hiring: sql<number>`coalesce(sum(${linkedinPostMessages.hiringFound}), 0)::int`,
      failed: sql<number>`count(*) filter (where ${linkedinPostMessages.parseFailed})::int`,
      lastEmailAt: sql<string | null>`max(${linkedinPostMessages.receivedAt})`,
      lastReadAt: sql<string | null>`max(${linkedinPostMessages.processedAt})`,
    })
    .from(linkedinPostMessages)
    .where(eq(linkedinPostMessages.userId, userId))
  const date = (v: unknown): Date | null => (v ? new Date(v as string) : null)
  return {
    emails: Number(row?.emails ?? 0),
    posts: Number(row?.posts ?? 0),
    hiring: Number(row?.hiring ?? 0),
    failed: Number(row?.failed ?? 0),
    lastEmailAt: date(row?.lastEmailAt),
    lastReadAt: date(row?.lastReadAt),
  }
}

/** The newest messages (counts only), for the "latest sync" list. */
export async function recent(userId: string, limit = 5, client: DbClient = db): Promise<PostMessageRow[]> {
  return client
    .select({
      messageId: linkedinPostMessages.messageId,
      kind: linkedinPostMessages.kind,
      receivedAt: linkedinPostMessages.receivedAt,
      postsFound: linkedinPostMessages.postsFound,
      hiringFound: linkedinPostMessages.hiringFound,
      parseFailed: linkedinPostMessages.parseFailed,
    })
    .from(linkedinPostMessages)
    .where(eq(linkedinPostMessages.userId, userId))
    .orderBy(desc(linkedinPostMessages.receivedAt))
    .limit(limit)
}

export async function pruneOlderThan(userId: string, before: Date, client: DbClient = db): Promise<void> {
  await client
    .delete(linkedinPostMessages)
    .where(and(eq(linkedinPostMessages.userId, userId), lt(linkedinPostMessages.receivedAt, before)))
}
