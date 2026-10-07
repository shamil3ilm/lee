'use client'
import { Badge } from '@/components/ui/badge'
import { EvaluationPanel } from '@/components/playground/evaluation-panel'
import type { CodingSubmitResult } from '@/lib/academy/coding/submit'
import { levelName } from '@/lib/academy/levels'
import type { CaseOutcome } from '@/lib/academy/runner/protocol'
import { VERDICT_LABELS, type FailedCase, type Judgement } from '@/lib/academy/runner/verdict'
import { formatKb, formatMs, VERDICT_TONE } from './labels'

function show(v: unknown): string {
  try {
    return JSON.stringify(v, null, 0) ?? 'null'
  } catch {
    return String(v)
  }
}

function Block({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/60 p-2 font-mono text-xs" data-testid={testId}>
        {value}
      </pre>
    </div>
  )
}

function FailedDetail({ failed, sql }: { failed: FailedCase; sql: boolean }) {
  if (failed.kind === 'hidden') {
    return (
      <p className="text-sm" data-testid="failed-hidden">
        Hidden case {failed.index} failed{failed.errorType ? ` (${failed.errorType})` : ''}. Its input stays hidden; check edge cases from the
        constraints.
      </p>
    )
  }
  return (
    <div className="space-y-2" data-testid="failed-visible">
      <p className="text-sm font-medium">Sample {failed.index}</p>
      <Block label={sql ? 'Seed data' : 'Input'} value={sql ? String(failed.args[0] ?? '') : failed.args.map(show).join('\n')} />
      {failed.error ? <Block label="Error" value={failed.error} /> : <Block label="Your output" value={show(failed.actual)} testId="actual-output" />}
      <Block label="Expected" value={show(failed.expected)} />
    </div>
  )
}

export function VerdictLine({ judgement, runtimeMs, memoryKb }: { judgement: Judgement; runtimeMs: number | null; memoryKb: number | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={VERDICT_TONE[judgement.verdict]} className="text-sm" data-testid="verdict">
        {VERDICT_LABELS[judgement.verdict]}
      </Badge>
      <span className="text-sm tabular-nums text-muted-foreground" data-testid="passed">
        {judgement.passed}/{judgement.total} passed
      </span>
      {judgement.verdict !== 'compile_error' ? (
        <span className="text-xs tabular-nums text-muted-foreground">
          Runtime {formatMs(runtimeMs)} · Memory {formatKb(memoryKb)}
        </span>
      ) : null}
    </div>
  )
}

export interface RunView {
  judgement: Judgement
  custom: CaseOutcome | null
  stdout: string
  fatal: string | null
  memoryKb: number | null
}

/** Result of Run: the visible samples (and the custom input's output). */
export function RunResultView({ run, sql }: { run: RunView; sql: boolean }) {
  const j = run.judgement
  return (
    <div className="space-y-3" data-testid="run-result">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Run · samples only</p>
      {run.fatal ? <p className="text-sm text-danger">{run.fatal}</p> : <VerdictLine judgement={j} runtimeMs={j.runtimeMs} memoryKb={run.memoryKb} />}
      {j.message ? <Block label="Compile error" value={j.message} testId="compile-error" /> : null}
      {j.failed ? <FailedDetail failed={j.failed} sql={sql} /> : null}
      {run.custom ? (
        run.custom.ok ? (
          <Block label="Custom input output" value={show(run.custom.output)} testId="custom-output" />
        ) : (
          <Block label="Custom input error" value={run.custom.error} />
        )
      ) : null}
      {run.stdout ? <Block label="Console output" value={run.stdout} testId="stdout" /> : null}
    </div>
  )
}

/** Result of Submit: verdict on every test (hidden ones by number only), scores and progress. */
export function SubmitResultView({ result, stdout, sql }: { result: CodingSubmitResult; stdout: string; sql: boolean }) {
  const j = result.judgement
  return (
    <div className="space-y-4" data-testid="submit-result">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Submit · all tests</p>
      <VerdictLine judgement={j} runtimeMs={result.runtimeMs} memoryKb={result.memoryKb} />
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="tabular-nums">
          +{result.xp} XP
        </Badge>
        {result.beatsPercent !== null ? <Badge variant="info">Faster than {result.beatsPercent}% of your accepted runs</Badge> : null}
        {result.firstSolve ? <Badge variant="success">First solve</Badge> : null}
        {result.dailySolved ? <Badge variant="success">Daily problem solved</Badge> : null}
        {result.levelAfter > result.levelBefore ? <Badge variant="success">Level up: {levelName(result.levelAfter)}</Badge> : null}
        {result.earned.map((a) => (
          <Badge key={a.id} variant="info">
            Achievement: {a.name}
          </Badge>
        ))}
      </div>
      {j.message ? <Block label="Compile error" value={j.message} testId="compile-error" /> : null}
      {j.failed ? <FailedDetail failed={j.failed} sql={sql} /> : null}
      {stdout ? <Block label="Console output" value={stdout} /> : null}
      <EvaluationPanel evaluation={result.evaluation} />
    </div>
  )
}
