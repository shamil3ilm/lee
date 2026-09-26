/**
 * Fixed-window counter per key, in process memory. Good enough to cap
 * /api/vitals beacons per user: a serverless instance that is recycled simply
 * starts a fresh window, and the table only ever stores aggregates, so the
 * worst a burst can do is inflate counts, never grow storage.
 */
export interface RateLimiter {
  /** True when `key` may make another call now (and counts it). */
  take: (key: string, nowMs?: number) => boolean
}

export function createRateLimiter(opts: {
  limit: number
  windowMs: number
  /** Keys tracked at once; the oldest window is dropped beyond this. */
  maxKeys?: number
}): RateLimiter {
  const maxKeys = opts.maxKeys ?? 1000
  const windows = new Map<string, { start: number; count: number }>()
  return {
    take(key, nowMs = Date.now()) {
      const current = windows.get(key)
      if (!current || nowMs - current.start >= opts.windowMs) {
        windows.delete(key)
        if (windows.size >= maxKeys) {
          const oldest = windows.keys().next().value
          if (oldest !== undefined) windows.delete(oldest)
        }
        windows.set(key, { start: nowMs, count: 1 })
        return true
      }
      if (current.count >= opts.limit) return false
      windows.set(key, { start: current.start, count: current.count + 1 })
      return true
    },
  }
}

/** Beacons per user per minute the API accepts (the reporter sends ≤ 10). */
export const VITALS_BEACONS_PER_MINUTE = 30
