import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { aiCallLogs } from '@/lib/db/schema'
import { runAfterResponse } from '@/lib/server/after-response'

/**
 * v10 logging helpers. Providers still write their own success rows during
 * generation (see gemini.ts / groq.ts → log-call.ts; inside a request those
 * inserts run after the response) — this module handles the two edge
 * cases the providers can't observe on their own:
 *
 *   1. A signal-check skip — nothing hits the model, so `writeSkip` inserts
 *      a synthetic log row with `signal_check_passed=false` + the code so
 *      analytics can group refusals by kind.
 *
 *   2. Linking a successful generation back to the document row after the
 *      service persists it. Providers don't know the documentId at call
 *      time (it's assigned by `documents.create()` after the AI response is
 *      validated); `linkLatestCallToDocument` patches the most recent OK
 *      log row for this user/kind so the analytics feedback loop can find
 *      it later. Best-effort — never throws.
 */

export interface AiCallKindMeta {
  userId: string
  provider: string
  kind: string
}

/**
 * Per-call metadata that the AI provider threads into its own log row.
 * The provider fills in the boring fields (provider name, tokens, latency);
 * the caller (usually a document-generator service) supplies the userId + a
 * `kind` so analytics can group by feature. `documentId` is patched in
 * after-the-fact by `linkLatestCallToDocument` since the doc row isn't
 * created until the AI response is validated.
 */
export interface CallMeta {
  userId?: string
  kind?: string
  documentId?: string
  signalCheckPassed?: boolean
  signalCheckCode?: string
  // v10.1 — prompt versioning. Providers can compute + attach the hash /
  // version so ai_call_logs rows are grouped by (kind, promptVersion) in
  // analytics. `onLogged` fires with the just-inserted row id so callers
  // (like the discovery service) can capture it for foreign-key linkage
  // without querying for the latest row afterwards.
  promptHash?: string
  promptVersion?: string
  onLogged?: (callId: string) => void
}

/**
 * Insert a synthetic `ai_call_logs` row representing a signal-check refusal.
 * `signal_check_passed=false` marks it as a skip, `signal_check_code` carries
 * the reason. status='skipped' distinguishes from provider failures. Never
 * throws — logging must not break the flow.
 */
export async function writeSkipLog(
  meta: AiCallKindMeta,
  code: string,
): Promise<void> {
  // Analytics only — after the response inside a request, inline elsewhere.
  await runAfterResponse('ai_skip_log', async () => {
    await db.insert(aiCallLogs).values({
      userId: meta.userId,
      provider: meta.provider,
      kind: meta.kind,
      status: 'skipped',
      signalCheckPassed: false,
      signalCheckCode: code,
    })
  })
}

/**
 * Attach `documentId` + normalize `kind` on the most recent OK ai_call_log
 * for this user. Used after a document is successfully generated so ratings
 * on the document can be routed back to the underlying call. Best-effort —
 * fails silently when no matching row exists (older code paths, tests
 * without a live DB, etc).
 *
 * Also patches `signal_check_passed=true` on the row so analytics can
 * distinguish "signal check ran and passed" from "signal check never ran".
 */
export async function linkLatestCallToDocument(
  userId: string,
  documentId: string,
  kind: string,
): Promise<void> {
  // The provider's log insert is itself deferred until after the response,
  // so link after it: wait for every deferred write scheduled before this.
  await runAfterResponse('ai_link_document', async ({ waitForEarlier }) => {
    await waitForEarlier()
    await linkLatest(userId, documentId, kind)
  })
}

async function linkLatest(userId: string, documentId: string, kind: string): Promise<void> {
  try {
    // Find the most recent OK log row for this user that has no document yet
    // and update it in-place.
    const [latest] = await db
      .select({ id: aiCallLogs.id })
      .from(aiCallLogs)
      .where(
        and(
          eq(aiCallLogs.userId, userId),
          eq(aiCallLogs.status, 'ok'),
          isNull(aiCallLogs.documentId),
        ),
      )
      .orderBy(desc(aiCallLogs.createdAt))
      .limit(1)
    if (!latest) return
    await db
      .update(aiCallLogs)
      .set({
        documentId,
        kind,
        signalCheckPassed: true,
      })
      .where(eq(aiCallLogs.id, latest.id))
  } catch {
    /* best-effort */
  }
}

/**
 * Backfill `userId` on the most recent OK log row that has no user yet.
 * Providers can't see the request session, so services patch it in after
 * the fact.
 */
export async function stampLatestCallUser(userId: string): Promise<void> {
  try {
    const [latest] = await db
      .select({ id: aiCallLogs.id })
      .from(aiCallLogs)
      .where(and(eq(aiCallLogs.status, 'ok'), isNull(aiCallLogs.userId)))
      .orderBy(desc(aiCallLogs.createdAt))
      .limit(1)
    if (!latest) return
    await db.update(aiCallLogs).set({ userId }).where(eq(aiCallLogs.id, latest.id))
  } catch {
    /* best-effort */
  }
}

/**
 * Trims noise from tests — expose only the raw SQL surface we need. Not
 * exported from the barrel.
 */
export const _internal = { sql }
