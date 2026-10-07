import type { JudgePack, PublicProblem } from '@/lib/academy/problems/public'
import type { CodeLanguage, SqlResult } from '@/lib/academy/problems/schema'
import type { RunReportInput } from '@/lib/academy/coding/report'
import { runJob, type JobOutcome } from './client'
import { outputsMatch, sqlResultsMatch } from './compare'
import type { CaseOutcome, FunctionLanguage, RunJob, RunResult } from './protocol'
import { judge, type JudgeCase, type Judgement } from './verdict'

/**
 * Run and Submit as the workbench performs them (browser only, lazy-loaded
 * with the runners). Run judges the visible samples here; Submit runs the
 * samples plus the hidden inputs from the judge pack, then a separate
 * timing job for the complexity fit, and returns a report for the server
 * to judge (hidden expectations never reach the browser).
 */

export const RUN_TIMEOUT_MS = 6_000
export const SUBMIT_TIMEOUT_MS = 12_000
export const SCALE_BUDGET_MS = 3_000
const SCALE_TIMEOUT_MS = 10_000

export interface RunOutput {
  judgement: Judgement
  /** Output of the custom input, when one was given. */
  custom: CaseOutcome | null
  stdout: string
  fatal: string | null
  memoryKb: number | null
}

function sampleCases(problem: PublicProblem): JudgeCase[] {
  return problem.kind === 'sql'
    ? problem.samples.map((s) => ({ expected: s.expected, visible: true, args: [s.seed] }))
    : problem.samples.map((s) => ({ expected: s.expected, visible: true, args: s.args }))
}

function matcher(problem: PublicProblem, language: CodeLanguage): (a: unknown, e: unknown) => boolean {
  if (problem.kind === 'sql') return (a, e) => !!a && sqlResultsMatch(a as SqlResult, e as SqlResult, problem.ordered)
  return (a, e) => outputsMatch(a, e, problem.compare, { looseEmpty: language === 'php' })
}

function buildJob(problem: PublicProblem, language: CodeLanguage, code: string, inputs: readonly unknown[], extra: { quality?: boolean } = {}): RunJob {
  if (problem.kind === 'sql') {
    return { kind: 'sql', language: 'sql', code, schema: problem.schema, datasets: inputs as string[] }
  }
  return {
    kind: 'function',
    language: language as FunctionLanguage,
    code,
    fnName: problem.fnNames[language] ?? problem.fn.name,
    cases: inputs as unknown[][],
    quality: extra.quality,
  }
}

function casesOf(outcome: JobOutcome): CaseOutcome[] {
  return outcome.result ? outcome.result.cases : outcome.partial.filter(Boolean)
}

function compileErrorOf(outcome: JobOutcome): string | null {
  return outcome.result?.compileError ?? null
}

export interface RunInput {
  problem: PublicProblem
  language: CodeLanguage
  code: string
  /** Function args, or an SQL seed script, to run after the samples. */
  custom: unknown[] | string | null
  onStatus?: (message: string) => void
}

export async function runSamples(input: RunInput): Promise<RunOutput> {
  const { problem, language, code } = input
  const samples = sampleCases(problem)
  const inputs: unknown[] = problem.kind === 'sql' ? problem.samples.map((s) => s.seed) : problem.samples.map((s) => s.args)
  if (input.custom !== null) inputs.push(input.custom)
  const outcome = await runJob(buildJob(problem, language, code, inputs), { timeoutMs: RUN_TIMEOUT_MS, onStatus: input.onStatus })
  const cases = casesOf(outcome)
  const judgement = judge(samples, { compileError: compileErrorOf(outcome), timedOut: outcome.timedOut, cases: cases.slice(0, samples.length) }, matcher(problem, language))
  return {
    judgement,
    custom: input.custom !== null ? (cases[samples.length] ?? null) : null,
    stdout: outcome.result?.stdout ?? '',
    fatal: outcome.fatal,
    memoryKb: outcome.result?.memoryKb ?? null,
  }
}

export interface SubmitRun {
  report: RunReportInput | null
  fatal: string | null
  stdout: string
}

function noErrors(result: RunResult | null): boolean {
  return !!result && !result.compileError && result.cases.every((c) => c.ok)
}

export async function runSubmission(
  problem: PublicProblem,
  language: CodeLanguage,
  code: string,
  pack: JudgePack,
  onStatus?: (message: string) => void,
): Promise<SubmitRun> {
  const inputs: unknown[] =
    problem.kind === 'sql'
      ? [...problem.samples.map((s) => s.seed), ...(pack.kind === 'sql' ? pack.hiddenSeeds : [])]
      : [...problem.samples.map((s) => s.args), ...(pack.kind === 'function' ? pack.hiddenArgs : [])]
  const quality = language === 'javascript' || language === 'typescript'
  const outcome = await runJob(buildJob(problem, language, code, inputs, { quality }), { timeoutMs: SUBMIT_TIMEOUT_MS, onStatus })
  if (outcome.fatal && !outcome.timedOut) return { report: null, fatal: outcome.fatal, stdout: '' }
  let scale: RunReportInput['scale'] = null
  if (pack.kind === 'function' && pack.scale && problem.kind === 'function' && noErrors(outcome.result)) {
    onStatus?.('Measuring how your solution scales…')
    const timing = await runJob(
      {
        kind: 'function',
        language: language as FunctionLanguage,
        code,
        fnName: problem.fnNames[language] ?? problem.fn.name,
        cases: [],
        scale: { specs: pack.scale.args, seed: pack.scale.seed, budgetMs: SCALE_BUDGET_MS },
      },
      { timeoutMs: SCALE_TIMEOUT_MS, onStatus },
    )
    scale = timing.result?.scale ?? null
  }
  return {
    report: {
      language,
      code,
      compileError: compileErrorOf(outcome),
      timedOut: outcome.timedOut,
      cases: casesOf(outcome),
      scale,
      quality: outcome.result?.quality ?? null,
      memoryKb: outcome.result?.memoryKb ?? null,
    },
    fatal: null,
    stdout: outcome.result?.stdout ?? '',
  }
}
