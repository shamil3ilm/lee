import type { z } from 'zod'
import { PermanentJobError } from './errors'
import type { ClaimedJob, HandlerContext, JobResult } from './types'

export interface HandlerSpec<P> {
  type: string
  /** 'global' jobs have no user (user_id null); 'user' jobs require one. */
  scope: 'global' | 'user'
  /** Validates the stored payload (small ids only). */
  payload: z.ZodType<P>
  /** Hard per-type timeout; the drain aborts and fails the attempt after it. */
  timeoutMs: number
  /**
   * Smallest remaining drain budget worth starting this job in. Below it the
   * job is released untouched (no attempt used) for the next drain.
   */
  minBudgetMs?: number
  /** Must be idempotent: a job can run again after a crash or a retry. */
  run(ctx: HandlerContext<P>): Promise<JobResult | void>
}

export interface RegisteredHandler {
  type: string
  scope: 'global' | 'user'
  timeoutMs: number
  minBudgetMs: number
  execute(args: { job: ClaimedJob; deadline: number; signal: AbortSignal }): Promise<JobResult>
}

export const DEFAULT_MIN_BUDGET_MS = 3_000

/** Type-erase a handler so different payload types share one registry. */
export function defineHandler<P>(spec: HandlerSpec<P>): RegisteredHandler {
  return {
    type: spec.type,
    scope: spec.scope,
    timeoutMs: spec.timeoutMs,
    minBudgetMs: Math.min(spec.minBudgetMs ?? DEFAULT_MIN_BUDGET_MS, spec.timeoutMs),
    async execute({ job, deadline, signal }) {
      if (spec.scope === 'user' && !job.userId) {
        throw new PermanentJobError(`${spec.type} needs a user`)
      }
      const parsed = spec.payload.safeParse(job.payload)
      if (!parsed.success) throw new PermanentJobError(`${spec.type}: invalid payload`)
      return (await spec.run({ job, payload: parsed.data, deadline, signal })) ?? {}
    },
  }
}

export type HandlerRegistry = ReadonlyMap<string, RegisteredHandler>

export function createRegistry(handlers: readonly RegisteredHandler[]): HandlerRegistry {
  const map = new Map<string, RegisteredHandler>()
  for (const h of handlers) {
    if (map.has(h.type)) throw new Error(`duplicate job handler: ${h.type}`)
    map.set(h.type, h)
  }
  return map
}
