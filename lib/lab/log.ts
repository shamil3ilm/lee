import { db } from '@/lib/db/client'
import { aiCallLogs } from '@/lib/db/schema'

/**
 * v14 — one ai_call_logs row per Model Lab model call. Error strings passed
 * here are already user-safe (ProviderError messages); keys never reach it.
 * Best-effort: logging must never break an Arena run.
 */
export async function logLabCall(x: {
  userId: string
  provider: string
  model: string
  kind: string
  status: 'ok' | 'error' | 'rate_limited'
  latencyMs: number
  promptTokens?: number
  completionTokens?: number
  error?: string
  promptHash: string
}): Promise<void> {
  try {
    await db.insert(aiCallLogs).values({
      userId: x.userId,
      provider: x.provider,
      model: x.model,
      kind: x.kind,
      status: x.status,
      latencyMs: Math.round(x.latencyMs),
      promptTokens: x.promptTokens ?? null,
      completionTokens: x.completionTokens ?? null,
      error: x.error ?? null,
      promptHash: x.promptHash,
    })
  } catch {
    /* logging must never break the call */
  }
}
