import { after } from 'next/server'
import { logger } from '@/lib/logger'

/**
 * Run a side effect (a log insert, a background re-assessment) without
 * holding the response for it.
 *
 * Inside a request (route handler, server action, server component) the task
 * starts immediately but is handed to Next's `after()`, which keeps the
 * function alive (`waitUntil`) until it settles — the caller returns at once.
 * Outside a request (cron helpers called directly, tests, scripts) `after()`
 * throws, and we simply await the task so nothing is lost.
 *
 * Never throws: a failing task is logged and swallowed.
 */
const inflight = new Set<Promise<void>>()

export async function runAfterResponse(what: string, task: () => Promise<unknown>): Promise<void> {
  const run = (async () => {
    try {
      await task()
    } catch (err) {
      logger.warn('after_response_task_failed', {
        what,
        err: err instanceof Error ? err.message : String(err),
      })
    }
  })()
  inflight.add(run)
  void run.finally(() => inflight.delete(run))
  try {
    after(run)
  } catch {
    // No request scope — run inline.
    await run
  }
}

/**
 * Wait for every deferred task started so far. Used by work that must
 * observe an earlier deferred write (e.g. linking the latest AI call log to
 * a document), and by tests.
 */
export async function settleDeferred(): Promise<void> {
  await Promise.allSettled([...inflight])
}
