import { capStdout, type CaseOutcome } from './protocol'

/**
 * The JavaScript harness: compiles the user's source into a function and
 * calls it with each case's arguments (deep-copied, so a function that
 * mutates its input never changes the next case). Runs inside the JS runner
 * worker, and in Node for the content validation gate (every reference
 * solution must pass its own tests). Never on the main thread or the server
 * request path for user code.
 */

export type UserFunction = (...args: unknown[]) => unknown

export interface ConsoleSink {
  lines: string[]
  console: Pick<Console, 'log' | 'info' | 'warn' | 'error' | 'debug'>
}

function show(v: unknown): string {
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v) ?? String(v)
  } catch {
    return String(v)
  }
}

export function consoleSink(maxLines = 400): ConsoleSink {
  const lines: string[] = []
  const write = (...args: unknown[]) => {
    if (lines.length < maxLines) lines.push(args.map(show).join(' '))
  }
  return { lines, console: { log: write, info: write, warn: write, error: write, debug: write } }
}

export function sinkText(sink: ConsoleSink): string {
  return capStdout(sink.lines.join('\n'))
}

/** First line of an error, without the stack. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`.slice(0, 500)
  return String(err).slice(0, 500)
}

export type Compiled = { ok: true; fn: UserFunction } | { ok: false; error: string }

/**
 * Compile `source` (plain JS, already transpiled from TS) and return the
 * function named `fnName`. The source runs once here (top-level statements
 * included), with a captured console and a CommonJS-style `exports` shim so
 * an `export` keyword transpiled away still works.
 */
export function compileJs(source: string, fnName: string, sink: ConsoleSink): Compiled {
  let factory: (console: ConsoleSink['console'], exports: Record<string, unknown>, module: { exports: Record<string, unknown> }) => unknown
  try {
    factory = new Function(
      'console',
      'exports',
      'module',
      `"use strict";\n${source}\n;return typeof ${fnName} === "function" ? ${fnName} : (exports && typeof exports.${fnName} === "function" ? exports.${fnName} : undefined);`,
    ) as typeof factory
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
  let fn: unknown
  try {
    const exports: Record<string, unknown> = {}
    fn = factory(sink.console, exports, { exports })
  } catch (err) {
    // A ReferenceError for the function name means it was never declared.
    if (err instanceof ReferenceError && err.message.includes(fnName)) {
      return { ok: false, error: `Define a function named ${fnName}.` }
    }
    return { ok: false, error: errorMessage(err) }
  }
  if (typeof fn !== 'function') return { ok: false, error: `Define a function named ${fnName}.` }
  return { ok: true, fn: fn as UserFunction }
}

function clone<T>(v: T): T {
  return typeof structuredClone === 'function' ? structuredClone(v) : (JSON.parse(JSON.stringify(v)) as T)
}

/** JSON round trip: what the server will see (undefined → null, NaN → null, Map → {}). */
export function toJsonValue(v: unknown): unknown {
  if (v === undefined) return null
  if (v instanceof Set) return [...v]
  if (v instanceof Map) return Object.fromEntries(v)
  return JSON.parse(JSON.stringify(v) ?? 'null')
}

export function runCase(fn: UserFunction, args: readonly unknown[]): CaseOutcome {
  const input = clone(args) as unknown[]
  const t0 = performance.now()
  try {
    const out = fn(...input)
    const ms = performance.now() - t0
    if (out instanceof Promise) return { ok: false, error: 'Return a value, not a Promise (the function must be synchronous).', ms }
    return { ok: true, output: toJsonValue(out), ms }
  } catch (err) {
    return { ok: false, error: errorMessage(err), ms: performance.now() - t0 }
  }
}

export function runJsCases(fn: UserFunction, cases: readonly (readonly unknown[])[]): CaseOutcome[] {
  return cases.map((args) => runCase(fn, args))
}

const MIN_BATCH_MS = 5
const MAX_BATCH = 4096
/** Above this many calls per batch the input is shared, not copied per call (memory). */
const COPY_PER_CALL_UP_TO = 16

function batchMs(fn: UserFunction, args: readonly unknown[], k: number): number {
  const shared = k > COPY_PER_CALL_UP_TO ? (clone(args) as unknown[]) : null
  const inputs = shared ? null : Array.from({ length: k }, () => clone(args) as unknown[])
  const t0 = performance.now()
  for (let i = 0; i < k; i++) fn(...(shared ?? (inputs?.[i] as unknown[])))
  return performance.now() - t0
}

/**
 * Milliseconds per call at one input: calls are batched until a batch takes
 * ≥ 5 ms (browsers coarsen timers to ~0.1 ms), then the median of three
 * batches is divided by the batch size.
 */
export function timeCall(fn: UserFunction, args: readonly unknown[]): number {
  let k = 1
  let first = batchMs(fn, args, k)
  while (first < MIN_BATCH_MS && k < MAX_BATCH) {
    k *= 2
    first = batchMs(fn, args, k)
  }
  if (first > 250) return first / k
  const runs = [first, batchMs(fn, args, k), batchMs(fn, args, k)].sort((a, b) => a - b)
  return (runs[1] ?? first) / k
}
