import { and, eq } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { processedGmailThreads } from '@/lib/db/schema'

export type ProcessedGmailThread = typeof processedGmailThreads.$inferSelect

/**
 * Cheap existence check used by the Gmail sync loop to skip threads that have
 * already been processed. Composite PK on (user_id, thread_id) makes this a
 * single-row lookup.
 */
export async function has(
  userId: string,
  threadId: string,
  client: DbClient = db,
): Promise<boolean> {
  const row = await client.query.processedGmailThreads.findFirst({
    where: and(
      eq(processedGmailThreads.userId, userId),
      eq(processedGmailThreads.threadId, threadId),
    ),
  })
  return Boolean(row)
}

/**
 * Idempotent marker for "this thread has been seen." onConflictDoNothing lets
 * concurrent sync passes race safely — the first insert wins, the second is a
 * no-op. matchedApplicationId is optional; unmatched threads still get a row
 * so we do not re-process them next cycle.
 */
export async function markProcessed(
  userId: string,
  threadId: string,
  matchedApplicationId?: string | null,
  client: DbClient = db,
): Promise<void> {
  await client
    .insert(processedGmailThreads)
    .values({ userId, threadId, matchedApplicationId: matchedApplicationId ?? null })
    .onConflictDoNothing({
      target: [processedGmailThreads.userId, processedGmailThreads.threadId],
    })
}
