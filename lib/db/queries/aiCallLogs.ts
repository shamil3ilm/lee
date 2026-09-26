import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { aiCallLogs } from '@/lib/db/schema'
import type { AiUsage } from '@/lib/ai/usage-types'

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
 * Retract an implicit "dismissed" signal (the user undid the dismiss). Only
 * rows still carrying 'dismissed' are cleared, so a later explicit action is
 * never overwritten.
 */
export async function clearDismissedAction(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await db
    .update(aiCallLogs)
    .set({ userAction: null })
    .where(
      and(
        eq(aiCallLogs.userId, userId),
        inArray(aiCallLogs.id, ids),
        eq(aiCallLogs.userAction, 'dismissed'),
      ),
    )
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

// ---------------------------------------------------------------------------
// v18 — per-result usage for AI output rendered after the fact (documents,
// discovery reasoning). Only the handful of usage columns are selected.
// ---------------------------------------------------------------------------

const USAGE_COLUMNS = {
  id: aiCallLogs.id,
  documentId: aiCallLogs.documentId,
  provider: aiCallLogs.provider,
  model: aiCallLogs.model,
  status: aiCallLogs.status,
  promptTokens: aiCallLogs.promptTokens,
  completionTokens: aiCallLogs.completionTokens,
  latencyMs: aiCallLogs.latencyMs,
  audioSeconds: aiCallLogs.audioSeconds,
}

interface UsageRow {
  id: string
  provider: string
  model: string | null
  status: string
  promptTokens: number | null
  completionTokens: number | null
  latencyMs: number | null
  audioSeconds: number | null
}

export function usageFromRow(r: UsageRow): AiUsage {
  const ok = r.status === 'ok'
  const failed = r.status === 'error' || r.status === 'rate_limited'
  const usage: AiUsage = {
    callId: r.id,
    provider: r.provider,
    model: r.model ?? null,
    inputTokens: r.promptTokens ?? 0,
    outputTokens: r.completionTokens ?? 0,
    latencyMs: r.latencyMs ?? 0,
    calls: ok ? 1 : 0,
    failedAttempts: failed ? 1 : 0,
    rateLimited: r.status === 'rate_limited' ? 1 : 0,
    cached: false,
    skipped: r.status === 'skipped',
  }
  if (r.audioSeconds != null) usage.audioSeconds = r.audioSeconds
  return usage
}

/** Usage of one call, scoped to its owner. */
export async function getUsage(userId: string, id: string): Promise<AiUsage | null> {
  const [row] = await db
    .select(USAGE_COLUMNS)
    .from(aiCallLogs)
    .where(and(eq(aiCallLogs.id, id), eq(aiCallLogs.userId, userId)))
    .limit(1)
  return row ? usageFromRow(row) : null
}

/**
 * Usage of the latest successful generation per document, for the documents
 * a page shows. One query on the ai_call_logs(document_id) partial index.
 */
export async function usageByDocument(
  userId: string,
  documentIds: string[],
): Promise<Record<string, AiUsage>> {
  if (documentIds.length === 0) return {}
  const rows = await db
    .selectDistinctOn([aiCallLogs.documentId], USAGE_COLUMNS)
    .from(aiCallLogs)
    .where(
      and(
        inArray(aiCallLogs.documentId, documentIds),
        eq(aiCallLogs.userId, userId),
        eq(aiCallLogs.status, 'ok'),
      ),
    )
    .orderBy(aiCallLogs.documentId, desc(aiCallLogs.createdAt))
  const out: Record<string, AiUsage> = {}
  for (const r of rows) if (r.documentId) out[r.documentId] = usageFromRow(r)
  return out
}
