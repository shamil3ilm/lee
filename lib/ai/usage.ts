import { AsyncLocalStorage } from 'node:async_hooks'
import type { AiCallStatus, AiUsage } from './usage-types'

/**
 * Request-scoped AI usage collection.
 *
 * A route or action wraps its AI work in a scope; every ai_call_logs row
 * written inside it (lib/ai/log-call.ts, the signal-skip writer, decision
 * providers) is noted here too, so the response can return a `usage` object
 * without threading ids through every service signature. The scope also
 * carries the signed-in user id so providers that are not told the user
 * (document generators) still attribute their log rows and quota snapshots.
 *
 * AsyncLocalStorage keeps parallel scopes apart (e.g. the decision
 * playground runs providers concurrently, one scope each).
 */
export interface AiCallNote {
  callId: string
  provider: string
  model: string | null
  status: AiCallStatus | string
  inputTokens: number
  outputTokens: number
  latencyMs?: number
  audioSeconds?: number | null
}

interface ScopeState {
  userId?: string
  notes: AiCallNote[]
}

const storage = new AsyncLocalStorage<ScopeState>()

/** The user id of the enclosing scope, if any. */
export function aiScopeUserId(): string | undefined {
  return storage.getStore()?.userId
}

/** Record one logged AI call in the enclosing scope. No-op outside a scope. */
export function noteAiCall(note: AiCallNote): void {
  storage.getStore()?.notes.push(note)
}

export class AiUsageScope {
  private readonly state: ScopeState

  constructor(userId?: string) {
    this.state = { userId, notes: [] }
  }

  /** Attribute calls to this user (for scopes created before auth resolves). */
  bindUser(userId: string): void {
    this.state.userId = userId
  }

  run<T>(fn: () => Promise<T>): Promise<T> {
    return storage.run(this.state, fn)
  }

  /** Summary of every call noted so far; null when no AI call happened. */
  get usage(): AiUsage | null {
    return summarizeUsage(this.state.notes)
  }
}

export async function withAiUsage<T>(
  ctx: { userId?: string },
  fn: () => Promise<T>,
): Promise<{ result: T; usage: AiUsage | null }> {
  const scope = new AiUsageScope(ctx.userId)
  const result = await scope.run(fn)
  return { result, usage: scope.usage }
}

export function summarizeUsage(notes: readonly AiCallNote[]): AiUsage | null {
  if (notes.length === 0) return null
  const ok = notes.filter((n) => n.status === 'ok')
  const failed = notes.filter((n) => n.status === 'error' || n.status === 'rate_limited')
  const skips = notes.filter((n) => n.status === 'skipped')
  const primary = ok.at(-1) ?? failed.at(-1) ?? skips.at(-1) ?? notes.at(-1)!
  const audio = ok.reduce<number | null>(
    (sum, n) => (n.audioSeconds == null ? sum : (sum ?? 0) + n.audioSeconds),
    null,
  )
  const usage: AiUsage = {
    callId: primary.callId,
    provider: primary.provider,
    model: primary.model,
    inputTokens: ok.reduce((s, n) => s + n.inputTokens, 0),
    outputTokens: ok.reduce((s, n) => s + n.outputTokens, 0),
    latencyMs: ok.reduce((s, n) => s + (n.latencyMs ?? 0), 0),
    calls: ok.length,
    failedAttempts: failed.length,
    rateLimited: failed.filter((n) => n.status === 'rate_limited').length,
    cached: false,
    skipped: ok.length === 0 && skips.length > 0,
  }
  if (audio != null) usage.audioSeconds = audio
  return usage
}
