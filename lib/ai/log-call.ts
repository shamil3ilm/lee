import { runAfterResponse } from '@/lib/server/after-response'
import type { CallMeta } from './log'

/**
 * Shared ai_call_logs writer for the model providers (Gemini, Groq).
 *
 * The insert is analytics, not part of the answer, so inside a request it
 * runs after the response via `runAfterResponse` (outside a request — cron,
 * tests — it is awaited). The one exception is a caller that registered
 * `onLogged`: it needs the row id right away to store a foreign key onto it
 * (discoveries.scored_by_call_id, cv_scores.ai_call_id), so that insert
 * stays inline.
 *
 * Never throws: a logging failure only costs one analytics row.
 */
export interface AiCallRecord {
  status: string
  latency: number
  promptTokens?: number
  completionTokens?: number
  error?: string
  meta?: CallMeta
}

async function insertCallLog(provider: string, x: AiCallRecord): Promise<void> {
  try {
    const { db } = await import('@/lib/db/client')
    const { aiCallLogs } = await import('@/lib/db/schema')
    const inserted = await db
      .insert(aiCallLogs)
      .values({
        userId: x.meta?.userId ?? null,
        provider,
        kind: x.meta?.kind ?? 'parse',
        promptTokens: x.promptTokens ?? null,
        completionTokens: x.completionTokens ?? null,
        latencyMs: x.latency,
        status: x.status,
        error: x.error ?? null,
        documentId: x.meta?.documentId ?? null,
        signalCheckPassed: x.meta?.signalCheckPassed ?? null,
        signalCheckCode: x.meta?.signalCheckCode ?? null,
        promptHash: x.meta?.promptHash ?? null,
        promptVersion: x.meta?.promptVersion ?? null,
      })
      .returning()
    const id = inserted[0]?.id
    if (id && x.meta?.onLogged) {
      try {
        x.meta.onLogged(id)
      } catch {
        /* callback must never break the call */
      }
    }
  } catch {
    /* logging must never break the call */
  }
}

export async function recordAiCall(provider: string, x: AiCallRecord): Promise<void> {
  if (x.meta?.onLogged) {
    await insertCallLog(provider, x)
    return
  }
  await runAfterResponse(`ai_call_log:${provider}`, () => insertCallLog(provider, x))
}
