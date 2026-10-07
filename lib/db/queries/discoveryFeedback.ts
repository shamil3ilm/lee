import { and, desc, eq, gte } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { discoveryFeedback } from '@/lib/db/schema'
import { isDismissReason, type DismissReason, type FeedbackKeys, type FeedbackRow } from '@/lib/apply/feedback'

/** One reason per (user, discovery); a second "Not for me" replaces the reason. */
export async function record(
  userId: string,
  discoveryId: string,
  reason: DismissReason,
  keys: FeedbackKeys,
  client: DbClient = db,
): Promise<void> {
  await client
    .insert(discoveryFeedback)
    .values({ userId, discoveryId, reason, ...keys })
    .onConflictDoUpdate({
      target: [discoveryFeedback.userId, discoveryFeedback.discoveryId],
      set: { reason, ...keys, createdAt: new Date() },
    })
}

/** Recent feedback (bounded), newest first. */
export async function listSince(
  userId: string,
  since: Date,
  limit = 500,
  client: DbClient = db,
): Promise<FeedbackRow[]> {
  const rows = await client
    .select({
      reason: discoveryFeedback.reason,
      roleFamily: discoveryFeedback.roleFamily,
      region: discoveryFeedback.region,
      companyKey: discoveryFeedback.companyKey,
    })
    .from(discoveryFeedback)
    .where(and(eq(discoveryFeedback.userId, userId), gte(discoveryFeedback.createdAt, since)))
    .orderBy(desc(discoveryFeedback.createdAt))
    .limit(limit)
  return rows.flatMap((r) => (isDismissReason(r.reason) ? [{ ...r, reason: r.reason }] : []))
}
