import type { CaseOutcome } from './protocol'

/**
 * Verdict mapping (LeetCode-style): the first failing case decides the
 * verdict, in test order (samples first, then hidden). A hidden failure is
 * reported by its number only — never its input, expected value or the
 * error text (which could echo input values). Pure: the browser uses it for
 * Run (visible samples), the server for Submit (hidden expectations never
 * leave the server).
 */

export const VERDICTS = ['accepted', 'wrong_answer', 'time_limit', 'runtime_error', 'compile_error'] as const
export type Verdict = (typeof VERDICTS)[number]

export const VERDICT_LABELS: Readonly<Record<Verdict, string>> = {
  accepted: 'Accepted',
  wrong_answer: 'Wrong Answer',
  time_limit: 'Time Limit Exceeded',
  runtime_error: 'Runtime Error',
  compile_error: 'Compile Error',
}

export interface JudgeCase {
  expected: unknown
  /** Visible samples may show their input; hidden cases never do. */
  visible: boolean
  args?: readonly unknown[]
}

export type FailedCase =
  | { kind: 'visible'; index: number; args: readonly unknown[]; expected: unknown; actual: unknown; error: string | null }
  | { kind: 'hidden'; index: number; errorType: string | null }

export interface RunReport {
  compileError: string | null
  /** The worker was terminated by the hard timeout. */
  timedOut: boolean
  /** One outcome per case, in order; missing tail = not reached. */
  cases: readonly CaseOutcome[]
}

export interface Judgement {
  verdict: Verdict
  passed: number
  total: number
  failed: FailedCase | null
  /** Sum of per-case milliseconds (runtime of the passed run). */
  runtimeMs: number
  /** Compile error text (the user's own code, safe to show). */
  message: string | null
}

const MESSAGE_MAX = 600

/** "TypeError: x is undefined" → "TypeError". */
export function errorType(message: string): string {
  const m = /^([A-Za-z_][\w.]*?(Error|Exception|Exceeded|Interrupt)?)\s*:/.exec(message.trim())
  return m?.[1]?.slice(0, 60) ?? 'Error'
}

function failure(c: JudgeCase, index: number, hiddenNumber: number, outcome: CaseOutcome | undefined): FailedCase {
  if (!c.visible) return { kind: 'hidden', index: hiddenNumber, errorType: outcome && !outcome.ok ? errorType(outcome.error) : null }
  return {
    kind: 'visible',
    index: index + 1,
    args: c.args ?? [],
    expected: c.expected,
    actual: outcome && outcome.ok ? outcome.output : null,
    error: outcome && !outcome.ok ? outcome.error.slice(0, MESSAGE_MAX) : null,
  }
}

export function judge(
  cases: readonly JudgeCase[],
  report: RunReport,
  matches: (actual: unknown, expected: unknown) => boolean,
): Judgement {
  const total = cases.length
  if (report.compileError) {
    return { verdict: 'compile_error', passed: 0, total, failed: null, runtimeMs: 0, message: report.compileError.slice(0, MESSAGE_MAX) }
  }
  let passed = 0
  let runtimeMs = 0
  let first: { verdict: Verdict; failed: FailedCase } | null = null
  let hiddenNumber = 0
  cases.forEach((c, i) => {
    if (!c.visible) hiddenNumber++
    const outcome = report.cases[i]
    if (outcome) runtimeMs += outcome.ms
    const verdict: Verdict | null = !outcome
      ? 'time_limit'
      : !outcome.ok
        ? 'runtime_error'
        : matches(outcome.output, c.expected)
          ? null
          : 'wrong_answer'
    if (verdict === null) {
      passed++
      return
    }
    if (!first) first = { verdict, failed: failure(c, i, hiddenNumber, outcome) }
  })
  const decided = first as { verdict: Verdict; failed: FailedCase } | null
  if (!decided) return { verdict: 'accepted', passed, total, failed: null, runtimeMs: Math.round(runtimeMs), message: null }
  // A case the hard timeout never reached is Time Limit Exceeded.
  return { verdict: decided.verdict, passed, total, failed: decided.failed, runtimeMs: Math.round(runtimeMs), message: null }
}

/** 0–100 share of cases passed. */
export function passRate(j: Pick<Judgement, 'passed' | 'total'>): number {
  return j.total === 0 ? 0 : Math.round((100 * j.passed) / j.total)
}
