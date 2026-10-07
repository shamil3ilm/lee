import type { CaseOutcome, RunJob, RunResult, WorkerReply, WorkerRequest } from '../protocol'

/**
 * Shared plumbing for the runner Web Workers. Each worker loads its
 * runtime first (Pyodide, PHP, PGlite from the jsDelivr CDN, or the
 * bundled TypeScript transpiler), then `lockNetwork()` removes every network
 * API before any user code runs: fetch, XMLHttpRequest, WebSocket,
 * EventSource, importScripts, nested workers and BroadcastChannel are
 * replaced by throwing stubs that cannot be restored (non-configurable).
 * Dynamic `import()` cannot be removed from a worker, so the JS runner
 * also rejects it at parse time (quality-js.ts). Workers are hard-killed
 * by the main thread on timeout (client.ts).
 */

const BLOCKED = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'importScripts',
  'Worker',
  'SharedWorker',
  'BroadcastChannel',
  'WebTransport',
] as const

let locked = false

export function lockNetwork(scope: typeof globalThis = globalThis): void {
  if (locked) return
  for (const name of BLOCKED) {
    const blocked = function blockedApi(): never {
      throw new Error(`${name} is disabled in the Playground sandbox (no network).`)
    }
    try {
      Object.defineProperty(scope, name, { value: blocked, writable: false, configurable: false, enumerable: false })
    } catch {
      // Already non-configurable in this engine: fall back to assignment.
      try {
        ;(scope as unknown as Record<string, unknown>)[name] = blocked
      } catch {
        /* nothing else to do */
      }
    }
  }
  try {
    const nav = (scope as unknown as { navigator?: { sendBeacon?: unknown } }).navigator
    if (nav && 'sendBeacon' in nav) Object.defineProperty(nav, 'sendBeacon', { value: () => false, configurable: false })
  } catch {
    /* best effort */
  }
  locked = true
}

export function isNetworkLocked(): boolean {
  return locked
}

export function post(reply: WorkerReply): void {
  ;(globalThis as unknown as { postMessage: (m: unknown) => void }).postMessage(reply)
}

export function postCase(index: number, outcome: CaseOutcome): void {
  ;(globalThis as unknown as { postMessage: (m: unknown) => void }).postMessage({ type: 'case', index, outcome })
}

/** JS heap in use, when the browser exposes it (Chromium). */
export function jsHeapKb(): number | null {
  const mem = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory
  return mem?.usedJSHeapSize ? Math.round(mem.usedJSHeapSize / 1024) : null
}

export function serveJobs(handle: (job: RunJob) => Promise<RunResult>): void {
  globalThis.addEventListener('message', (event: Event) => {
    const data = (event as MessageEvent<WorkerRequest>).data
    if (!data || data.type !== 'run') return
    handle(data.job).then(
      (result) => post({ type: 'result', result }),
      (err: unknown) => post({ type: 'fatal', message: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500) }),
    )
  })
}
