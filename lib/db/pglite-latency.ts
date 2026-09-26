import type { PGlite } from '@electric-sql/pglite'

/**
 * Local performance testing only: `PGLITE_QUERY_DELAY_MS=1500` makes every
 * query on the in-process PGlite database wait that long first, so a local
 * production build behaves like a cold Neon (1–3 s per round trip) and you
 * can watch the static shell paint before the data streams in.
 *
 * It can never slow production: the flag is read only where the client is
 * PGlite, and Neon/Postgres URLs never take that branch.
 */
export const PGLITE_QUERY_DELAY_ENV = 'PGLITE_QUERY_DELAY_MS'

const MAX_DELAY_MS = 10_000

/** Whole milliseconds in 0..10 000; anything else (unset, junk) is 0 = off. */
export function parseQueryDelay(raw: string | undefined): number {
  if (!raw) return 0
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) return 0
  return Math.min(n, MAX_DELAY_MS)
}

const DELAYED_METHODS = new Set<PropertyKey>(['query', 'exec'])

/**
 * A view of `client` whose `query` / `exec` wait `delayMs` first. Returns the
 * client itself when the delay is 0. The original instance is not modified.
 */
export function withSimulatedLatency(client: PGlite, delayMs: number): PGlite {
  if (delayMs <= 0) return client
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, delayMs))
  return new Proxy(client, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop, target)
      if (typeof value !== 'function') return value
      const bound = (value as (...args: unknown[]) => unknown).bind(target)
      if (!DELAYED_METHODS.has(prop)) return bound
      return async (...args: unknown[]) => {
        await wait()
        return bound(...args)
      }
    },
  })
}
