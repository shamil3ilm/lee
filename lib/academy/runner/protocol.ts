import type { GenSpec, SqlResult } from '@/lib/academy/problems/schema'
import type { QualityMetrics } from './quality-types'

/**
 * Messages between the workbench (main thread) and a runner Web Worker.
 * Everything is structured-clone safe. Client-safe.
 */

export type FunctionLanguage = 'javascript' | 'typescript' | 'python' | 'php'

export type CaseOutcome =
  | { ok: true; output: unknown; ms: number }
  | { ok: false; error: string; ms: number }

export interface ScalePoint {
  n: number
  /** Median milliseconds per call at size n. */
  ms: number
}

export interface ScaleJob {
  specs: readonly GenSpec[]
  seed: number
  /** Wall-clock budget for the whole fit. */
  budgetMs: number
}

export interface FunctionJob {
  kind: 'function'
  language: FunctionLanguage
  code: string
  /** The function name in this language (snake_case for Python). */
  fnName: string
  cases: readonly (readonly unknown[])[]
  scale?: ScaleJob
  /** Compute code-quality metrics (JS/TS only; others are measured on the server). */
  quality?: boolean
}

export interface SqlJob {
  kind: 'sql'
  language: 'sql'
  code: string
  schema: string
  /** One seed script per case. */
  datasets: readonly string[]
}

export type RunJob = FunctionJob | SqlJob

export interface RunResult {
  /** Syntax or type-strip errors before any case ran. */
  compileError: string | null
  cases: CaseOutcome[]
  /** Captured console / print / echo output (capped). */
  stdout: string
  scale: ScalePoint[] | null
  quality: QualityMetrics | null
  /** Heap or wasm memory after the run, when measurable. */
  memoryKb: number | null
}

export type WorkerRequest = { type: 'run'; job: RunJob }

export type WorkerReply =
  | { type: 'status'; message: string }
  /** The runtime is loaded: the hard timeout starts now. */
  | { type: 'ready' }
  | { type: 'case'; index: number; outcome: CaseOutcome }
  /** One timing point of the complexity fit (kept even if the job then times out). */
  | { type: 'scale'; point: ScalePoint }
  | { type: 'result'; result: RunResult }
  | { type: 'fatal'; message: string }

export const STDOUT_MAX_CHARS = 8000

export function capStdout(text: string): string {
  return text.length > STDOUT_MAX_CHARS ? `${text.slice(0, STDOUT_MAX_CHARS)}\n… output truncated` : text
}

export function emptyResult(compileError: string | null = null): RunResult {
  return { compileError, cases: [], stdout: '', scale: null, quality: null, memoryKb: null }
}

/** For SQL, a case's output is the result set. */
export type SqlOutput = SqlResult
