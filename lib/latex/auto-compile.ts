// ---------------------------------------------------------------------------
// Auto-compile scheduling (v17 §8.5 decision 5): compile 2.5 s after typing
// pauses, or after at most 5 s of continuous typing, with
//   - at most one compile in flight (a change during a compile queues one
//     follow-up with the latest source), and
//   - never an automatic compile of a source that was already compiled.
// Manual compiles (button, Ctrl/Cmd+Enter, Ctrl/Cmd+S) run at once and may
// repeat an unchanged source; the server's PDF cache answers those.
// ---------------------------------------------------------------------------

export const AUTO_COMPILE_DEBOUNCE_MS = 2500
export const AUTO_COMPILE_MAX_WAIT_MS = 5000

export interface CompileSchedulerOptions<T> {
  debounceMs?: number
  maxWaitMs?: number
  /** Identity of a snapshot: equal keys never auto-compile twice in a row. */
  keyOf: (snapshot: T) => string
  run: (snapshot: T) => Promise<void>
}

export interface CompileScheduler<T> {
  /** The source changed: (re)start the debounce if auto-compile is on. */
  change: (snapshot: T) => void
  /** Compile now (manual); queued behind an in-flight compile. */
  compileNow: (snapshot: T) => void
  setEnabled: (enabled: boolean) => void
  dispose: () => void
  readonly busy: boolean
}

type FollowUp = 'none' | 'auto' | 'force'

export function createCompileScheduler<T>(options: CompileSchedulerOptions<T>): CompileScheduler<T> {
  const debounceMs = options.debounceMs ?? AUTO_COMPILE_DEBOUNCE_MS
  const maxWaitMs = options.maxWaitMs ?? AUTO_COMPILE_MAX_WAIT_MS
  let latest: T | null = null
  let lastKey: string | null = null
  let inFlight = false
  let followUp: FollowUp = 'none'
  let enabled = true
  let disposed = false
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null

  function clearTimers(): void {
    if (debounceTimer) clearTimeout(debounceTimer)
    if (maxWaitTimer) clearTimeout(maxWaitTimer)
    debounceTimer = null
    maxWaitTimer = null
  }

  function flush(): void {
    clearTimers()
    if (latest !== null) attempt(latest, false)
  }

  function attempt(snapshot: T, force: boolean): void {
    if (disposed) return
    if (inFlight) {
      followUp = force || followUp === 'force' ? 'force' : 'auto'
      return
    }
    const key = options.keyOf(snapshot)
    if (!force && key === lastKey) return
    inFlight = true
    lastKey = key
    options
      .run(snapshot)
      .catch(() => {
        // The runner reports its own errors; the slot must still be freed.
      })
      .finally(() => {
        inFlight = false
        const next = followUp
        followUp = 'none'
        if (next !== 'none' && latest !== null) attempt(latest, next === 'force')
      })
  }

  return {
    change(snapshot) {
      latest = snapshot
      if (!enabled || disposed) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(flush, debounceMs)
      if (!maxWaitTimer) maxWaitTimer = setTimeout(flush, maxWaitMs)
    },
    compileNow(snapshot) {
      latest = snapshot
      clearTimers()
      attempt(snapshot, true)
    },
    setEnabled(next) {
      enabled = next
      if (!next) clearTimers()
    },
    dispose() {
      disposed = true
      clearTimers()
    },
    get busy() {
      return inFlight
    },
  }
}
