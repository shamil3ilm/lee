import type { CaseOutcome, RunJob, RunResult, ScalePoint, WorkerReply } from './protocol'

/**
 * Main-thread side of the runners (browser only). One warm worker per
 * runtime (JS/TS, Python, PHP, SQL) so Pyodide, PHP and PGlite load once
 * per page. Every job has a hard timeout that starts when the runtime is
 * ready: on expiry the worker is terminated (killing any infinite loop)
 * and the next job starts a fresh one. Workers are bundled same-origin
 * scripts, created only when the first job of that kind runs, so none of
 * this reaches a page's initial JavaScript.
 */

type Runtime = 'js' | 'ts' | 'python' | 'php' | 'sql'

export interface JobOutcome {
  result: RunResult | null
  timedOut: boolean
  /** The worker crashed or the runtime failed to load. */
  fatal: string | null
  /** Cases reported before a timeout (JS, Python and SQL report each case). */
  partial: CaseOutcome[]
  /** Timing points reported before a timeout. */
  partialScale: ScalePoint[]
}

export interface JobOptions {
  timeoutMs: number
  /** How long a runtime may take to download and start. */
  loadTimeoutMs?: number
  onStatus?: (message: string) => void
}

const pool = new Map<Runtime, Worker>()

function runtimeFor(job: RunJob): Runtime {
  if (job.kind === 'sql') return 'sql'
  if (job.language === 'python') return 'python'
  if (job.language === 'php') return 'php'
  if (job.language === 'typescript') return 'ts'
  return 'js'
}

function create(runtime: Runtime): Worker {
  switch (runtime) {
    case 'js':
      return new Worker(new URL('./workers/js.worker.ts', import.meta.url), { type: 'module', name: 'lee-runner-js' })
    case 'ts':
      return new Worker(new URL('./workers/ts.worker.ts', import.meta.url), { type: 'module', name: 'lee-runner-ts' })
    case 'python':
      return new Worker(new URL('./workers/python.worker.ts', import.meta.url), { type: 'module', name: 'lee-runner-python' })
    case 'php':
      return new Worker(new URL('./workers/php.worker.ts', import.meta.url), { type: 'module', name: 'lee-runner-php' })
    case 'sql':
      return new Worker(new URL('./workers/sql.worker.ts', import.meta.url), { type: 'module', name: 'lee-runner-sql' })
  }
}

function workerFor(runtime: Runtime): Worker {
  const existing = pool.get(runtime)
  if (existing) return existing
  const w = create(runtime)
  pool.set(runtime, w)
  return w
}

function kill(runtime: Runtime): void {
  pool.get(runtime)?.terminate()
  pool.delete(runtime)
}

/** Stop every runner (e.g. when leaving the workbench). */
export function terminateAll(): void {
  for (const runtime of [...pool.keys()]) kill(runtime)
}

const DEFAULT_LOAD_TIMEOUT_MS = 120_000

export function runJob(job: RunJob, opts: JobOptions): Promise<JobOutcome> {
  const runtime = runtimeFor(job)
  let worker: Worker
  try {
    worker = workerFor(runtime)
  } catch (err) {
    return Promise.resolve({
      result: null,
      timedOut: false,
      fatal: err instanceof Error ? err.message : 'Could not start the runner.',
      partial: [],
      partialScale: [],
    })
  }
  return new Promise<JobOutcome>((resolve) => {
    const partial: CaseOutcome[] = []
    const partialScale: ScalePoint[] = []
    let timer: ReturnType<typeof setTimeout> | null = null
    let settled = false
    const finish = (outcome: JobOutcome) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      resolve(outcome)
    }
    const arm = (ms: number, timedOut: boolean, message: string | null) => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        kill(runtime)
        finish({ result: null, timedOut, fatal: message, partial, partialScale })
      }, ms)
    }
    const onMessage = (event: MessageEvent<WorkerReply>) => {
      const msg = event.data
      if (msg.type === 'status') opts.onStatus?.(msg.message)
      else if (msg.type === 'ready') arm(opts.timeoutMs, true, null)
      else if (msg.type === 'case') partial[msg.index] = msg.outcome
      else if (msg.type === 'scale') partialScale.push(msg.point)
      else if (msg.type === 'result') finish({ result: msg.result, timedOut: false, fatal: null, partial, partialScale })
      else if (msg.type === 'fatal') {
        kill(runtime)
        finish({ result: null, timedOut: false, fatal: msg.message, partial, partialScale })
      }
    }
    const onError = (event: ErrorEvent) => {
      event.preventDefault()
      kill(runtime)
      finish({ result: null, timedOut: false, fatal: event.message || 'The runner crashed.', partial, partialScale })
    }
    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)
    // Until "ready": the runtime download budget, not the run budget.
    arm(opts.loadTimeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS, false, 'The runtime took too long to load. Check your connection and try again.')
    worker.postMessage({ type: 'run', job })
  })
}
