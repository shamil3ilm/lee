import { randomUUID } from 'node:crypto'
import { runAfterResponse } from '@/lib/server/after-response'
import type { CallMeta } from './log'
import { aiScopeUserId, noteAiCall } from './usage'

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
 * The row id is generated here, so the id is known before the deferred
 * insert runs: the call is noted in the enclosing usage scope (lib/ai/usage)
 * and the response can carry it. The scope also supplies the user id when
 * the provider was not told who is calling.
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
  /** Model id actually called. */
  model?: string | null
  /** Provider HTTP status for this attempt (429 = rate limited). */
  httpStatus?: number | null
  /** Speech-to-text: audio duration when the provider reports it. */
  audioSeconds?: number | null
  /** Speech-to-text: upload size, when the duration is unknown. */
  inputBytes?: number | null
}

async function insertCallLog(
  provider: string,
  x: AiCallRecord,
  id: string,
  userId: string | null,
): Promise<void> {
  try {
    const { db } = await import('@/lib/db/client')
    const { aiCallLogs } = await import('@/lib/db/schema')
    const inserted = await db
      .insert(aiCallLogs)
      .values({
        id,
        userId,
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
        model: x.model ?? null,
        httpStatus: x.httpStatus ?? null,
        audioSeconds: x.audioSeconds ?? null,
        inputBytes: x.inputBytes ?? null,
      })
      .returning()
    const insertedId = inserted[0]?.id
    if (insertedId && x.meta?.onLogged) {
      try {
        x.meta.onLogged(insertedId)
      } catch {
        /* callback must never break the call */
      }
    }
  } catch {
    /* logging must never break the call */
  }
}

/** Writes one ai_call_logs row and returns its (pre-generated) id. */
export async function recordAiCall(provider: string, x: AiCallRecord): Promise<string> {
  const id = randomUUID()
  const userId = x.meta?.userId ?? aiScopeUserId() ?? null
  noteAiCall({
    callId: id,
    provider,
    model: x.model ?? null,
    status: x.status,
    inputTokens: x.promptTokens ?? 0,
    outputTokens: x.completionTokens ?? 0,
    latencyMs: x.latency,
    audioSeconds: x.audioSeconds ?? null,
  })
  if (x.meta?.onLogged) {
    await insertCallLog(provider, x, id, userId)
    return id
  }
  await runAfterResponse(`ai_call_log:${provider}`, () => insertCallLog(provider, x, id, userId))
  return id
}
