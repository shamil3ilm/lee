/**
 * Per-response AI usage summary returned next to an AI result so the UI can
 * show "1,240 in · 310 out · model · 1.2 s". Counts and metadata only —
 * never prompt text or user content. Pure types: safe to import from client
 * components.
 */
export interface AiUsage {
  /** ai_call_logs row id of the (last) successful call; the skip/failed row otherwise. */
  callId: string | null
  provider: string
  model: string | null
  inputTokens: number
  outputTokens: number
  /** Sum of latency over the successful calls. */
  latencyMs: number
  /** Successful provider calls rolled into this response. */
  calls: number
  /** Failed attempts (retries included) during this response. */
  failedAttempts: number
  /** Of the failed attempts, how many were HTTP 429 / rate limited. */
  rateLimited: number
  /** Served without a model call. No AI result cache exists yet, so false today. */
  cached: boolean
  /** A signal check refused the call before it reached the model. */
  skipped: boolean
  /** Transcribed audio duration, for speech-to-text calls. */
  audioSeconds?: number | null
}

export type AiCallStatus = 'ok' | 'error' | 'rate_limited' | 'skipped'
