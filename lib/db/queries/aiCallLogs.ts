import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { aiCallLogs } from '@/lib/db/schema'

/**
 * v10 — AI call log query helpers. Keep this thin: analytics reads via
 * `lib/analytics/service.ts`, the rate routes use the mutation helpers
 * below to attach user feedback to a specific call.
 */

export type AiCallLog = typeof aiCallLogs.$inferSelect

/**
 * Update the `user_rating` (+ optional `user_action`) on a specific call
 * row. Ownership is enforced by requiring the row's `user_id` to match
 * `userId` — an unauth'd or wrong-user call is a no-op that returns null.
 */
export async function updateRating(
  userId: string,
  id: string,
  rating: 1 | 5,
  action?: 'used' | 'regenerated' | 'dismissed',
): Promise<AiCallLog | null> {
  const patch: Partial<AiCallLog> = { userRating: rating }
  if (action) patch.userAction = action
  const [row] = await db
    .update(aiCallLogs)
    .set(patch)
    .where(and(eq(aiCallLogs.id, id), eq(aiCallLogs.userId, userId)))
    .returning()
  return row ?? null
}

/**
 * Record an implicit-signal `user_action` on a specific call row without
 * touching `user_rating`. Used when the user regenerates a doc, copies an
 * outreach, or dismisses a discovery.
 */
export async function updateAction(
  userId: string,
  id: string,
  action: 'used' | 'regenerated' | 'dismissed',
): Promise<AiCallLog | null> {
  const [row] = await db
    .update(aiCallLogs)
    .set({ userAction: action })
    .where(and(eq(aiCallLogs.id, id), eq(aiCallLogs.userId, userId)))
    .returning()
  return row ?? null
}

/**
 * Find the most recent successful ai_call_logs row for a given document.
 * Used by `POST /api/documents/[id]/rate` to route a document rating to
 * the underlying generation call. Filters to `status='ok'` because we
 * only rate the outputs we actually produced.
 */
export async function findLatestByDocument(
  userId: string,
  documentId: string,
): Promise<AiCallLog | null> {
  const [row] = await db
    .select()
    .from(aiCallLogs)
    .where(
      and(
        eq(aiCallLogs.userId, userId),
        eq(aiCallLogs.documentId, documentId),
        eq(aiCallLogs.status, 'ok'),
      ),
    )
    .orderBy(desc(aiCallLogs.createdAt))
    .limit(1)
  return row ?? null
}

/**
 * Look up a rated row by id, scoped to the user. Returns null when the
 * row does not exist or is owned by someone else. Used by rate routes for
 * echoing back the persisted state.
 */
export async function getById(userId: string, id: string): Promise<AiCallLog | null> {
  const [row] = await db
    .select()
    .from(aiCallLogs)
    .where(and(eq(aiCallLogs.id, id), eq(aiCallLogs.userId, userId)))
    .limit(1)
  return row ?? null
}

// Exposed for tests + analytics to iterate all rated rows for a user.
export async function listRated(userId: string): Promise<AiCallLog[]> {
  return db
    .select()
    .from(aiCallLogs)
    .where(and(eq(aiCallLogs.userId, userId), isNotNull(aiCallLogs.userRating)))
    .orderBy(desc(aiCallLogs.createdAt))
}
