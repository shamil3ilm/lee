import { after } from 'next/server'
import { logger } from '@/lib/logger'

/**
 * Run a side effect (a log insert, a background re-assessment) after the
 * response instead of on the response path.
 *
 * Inside a request (route handler, server action, server component) the
 * task is registered with Next's `after()`: it runs once the response has
 * been sent, and the platform keeps the function alive (`waitUntil`) until
 * it settles. Outside a request (cron helpers called directly, tests,
 * scripts) `after()` throws, and the task simply runs inline.
 *
 * Tasks can wait for every task scheduled before them (`waitForEarlier`),
 * e.g. linking the latest AI call log to a document must see the log row
 * the provider scheduled earlier in the same request.
 *
 * Never throws: a failing task is logged and swallowed.
 */
export interface AfterTaskContext {
  /** Resolves once every task scheduled before this one has settled. */
  waitForEarlier(): Promise<void>
}

const pending = new Map<number, Promise<void>>()
let nextSeq = 0

export async function runAfterResponse(
  what: string,
  task: (ctx: AfterTaskContext) => Promise<unknown>,
): Promise<void> {
  const seq = nextSeq++
  let markDone!: () => void
  pending.set(seq, new Promise<void>((resolve) => (markDone = resolve)))
  const ctx: AfterTaskContext = {
    waitForEarlier: async () => {
      const earlier = [...pending].filter(([s]) => s < seq).map(([, p]) => p)
      await Promise.all(earlier)
    },
  }
  const run = async (): Promise<void> => {
    try {
      await task(ctx)
    } catch (err) {
      logger.warn('after_response_task_failed', {
        what,
        err: err instanceof Error ? err.message : String(err),
      })
    } finally {
      pending.delete(seq)
      markDone()
    }
  }
  try {
    after(run)
  } catch {
    // No request scope — run inline.
    await run()
  }
}

/** Wait for every scheduled task that has not settled yet. For tests. */
export async function settleDeferred(): Promise<void> {
  await Promise.all([...pending.values()])
}
