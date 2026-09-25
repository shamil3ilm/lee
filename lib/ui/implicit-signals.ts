/**
 * v10 — client-side implicit-signal helper.
 *
 * Explicit thumbs live in `<FeedbackButtons />` and route to the
 * `/api/documents/{id}/rate` endpoint. Implicit signals (regenerate, copy,
 * dismiss) go through `/api/documents/{id}/action` which patches the
 * `user_action` column on the underlying ai_call_logs row.
 *
 * Best-effort: never throws, never toasts, never blocks. The user's
 * action already happened; we're just recording the signal.
 */

export type ImplicitAction = 'used' | 'regenerated' | 'dismissed'

export async function logImplicitAction(
  documentId: string,
  action: ImplicitAction,
): Promise<void> {
  try {
    await fetch(`/api/documents/${documentId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
  } catch {
    /* implicit signals are best-effort */
  }
}
