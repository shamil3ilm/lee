/**
 * Minimum spacing between requests to one host, per process. Reputation
 * refreshes run a couple at a time inside a drain; this keeps every
 * upstream at or below its published rate (GDELT: one request per 5 s).
 * State is a private map of the next free slot per host — the only
 * mutable state in the reputation module, by necessity.
 */

export interface HostLimiter {
  /** Resolves when a request to `host` may start. */
  wait(host: string): Promise<void>
}

export interface LimiterOptions {
  intervals: Readonly<Record<string, number>>
  defaultIntervalMs?: number
  clock?: () => number
  sleep?: (ms: number) => Promise<void>
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function createHostLimiter(opts: LimiterOptions): HostLimiter {
  const clock = opts.clock ?? Date.now
  const sleep = opts.sleep ?? realSleep
  const nextFree = new Map<string, number>()
  return {
    async wait(host: string): Promise<void> {
      const interval = opts.intervals[host] ?? opts.defaultIntervalMs ?? 1_000
      const now = clock()
      const slot = Math.max(now, nextFree.get(host) ?? 0)
      // Reserve before sleeping so concurrent callers queue behind us.
      nextFree.set(host, slot + interval)
      if (slot > now) await sleep(slot - now)
    },
  }
}

/** A limiter that never waits (tests). */
export const NO_WAIT: HostLimiter = { wait: async () => undefined }

/** Published limits, with headroom (docs/company-reviews.md). */
export const HOST_INTERVALS_MS: Readonly<Record<string, number>> = {
  'api.gdeltproject.org': 6_000,
  'hn.algolia.com': 500,
  'www.wikidata.org': 1_000,
  'places.googleapis.com': 250,
}

export const defaultLimiter: HostLimiter = createHostLimiter({ intervals: HOST_INTERVALS_MS })
