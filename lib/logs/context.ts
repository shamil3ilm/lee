import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Ambient ids for persisted events: a queue job runs its handler inside
 * `withLogContext({ userId, jobId })`, so every warning the handler (or the
 * services it calls) logs is attributed to that user and job without
 * threading ids through every call. Kept on globalThis so separately
 * bundled server chunks share one store.
 */
export interface LogContext {
  userId?: string | null
  jobId?: string | null
  sourceId?: string | null
}

const g = globalThis as typeof globalThis & { __leeLogContext?: AsyncLocalStorage<LogContext> }
const store: AsyncLocalStorage<LogContext> = (g.__leeLogContext ??= new AsyncLocalStorage<LogContext>())

export function withLogContext<T>(ctx: LogContext, fn: () => T): T {
  return store.run({ ...store.getStore(), ...ctx }, fn)
}

export function currentLogContext(): LogContext | undefined {
  return store.getStore()
}
