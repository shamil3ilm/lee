'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Lightbulb, Lock } from 'lucide-react'
import { revealHintAction, unlockSolutionAction } from '@/app/(authed)/playground/problems/actions'
import { MarkdownText } from '@/components/markdown-text'
import { LocalTime } from '@/components/local-time'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { SubmissionView } from '@/lib/academy/coding/workbench'
import type { PublicProblem, SolutionView } from '@/lib/academy/problems/public'
import { DIFFICULTY_LABELS, LANGUAGE_LABELS, type CodeLanguage } from '@/lib/academy/problems/constants'
import { VERDICT_LABELS } from '@/lib/academy/runner/verdict'
import { DIFFICULTY_TONE, formatMs, ROLE_LABELS, TOPIC_LABELS, VERDICT_TONE } from './labels'

function show(v: unknown): string {
  return JSON.stringify(v) ?? 'null'
}

function Examples({ problem }: { problem: PublicProblem }) {
  return (
    <div className="space-y-3">
      {problem.kind === 'sql'
        ? problem.samples.map((s, i) => (
            <div key={i} className="space-y-1 rounded-lg border bg-muted/40 p-3 text-xs">
              <p className="font-medium">Example {i + 1}</p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono">{s.seed}</pre>
              <p className="font-medium">Expected</p>
              <pre className="overflow-x-auto font-mono">{[s.expected.columns.join(' | '), ...s.expected.rows.map((r) => r.map(show).join(' | '))].join('\n')}</pre>
              {s.explanation ? <p className="text-muted-foreground">{s.explanation}</p> : null}
            </div>
          ))
        : problem.samples.map((s, i) => (
            <div key={i} className="space-y-1 rounded-lg border bg-muted/40 p-3 text-xs" data-testid="example">
              <p className="font-medium">Example {i + 1}</p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono">
                {problem.fn.params.map((p, k) => `${p.name} = ${show(s.args[k])}`).join('\n')}
              </pre>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono">Output: {show(s.expected)}</pre>
              {s.explanation ? <p className="text-muted-foreground">{s.explanation}</p> : null}
            </div>
          ))}
    </div>
  )
}

function Description({ problem, skillName }: { problem: PublicProblem; skillName: string }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={DIFFICULTY_TONE[problem.difficulty]}>{DIFFICULTY_LABELS[problem.difficulty]}</Badge>
        <Badge variant="outline">{skillName}</Badge>
        {problem.topics.map((t) => (
          <Badge key={t} variant="secondary">
            {TOPIC_LABELS[t]}
          </Badge>
        ))}
        {problem.roles.map((r) => (
          <Badge key={r} variant="outline">
            {ROLE_LABELS[r]}
          </Badge>
        ))}
      </div>
      <MarkdownText source={problem.statement} />
      {problem.kind === 'sql' ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Schema</p>
          <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs">{problem.schema}</pre>
        </div>
      ) : null}
      <Examples problem={problem} />
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Constraints</p>
        <ul className="list-disc space-y-0.5 pl-5 text-sm">
          {problem.constraints.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">
        Target: {problem.target.time} time. Par {Math.round(problem.parSec / 60)} min. {problem.hiddenCount} hidden tests run on Submit.
      </p>
    </div>
  )
}

function Hints({ slug, count, initial }: { slug: string; count: number; initial: string[] }) {
  const [hints, setHints] = useState(initial)
  const [pending, start] = useTransition()
  const reveal = () =>
    start(async () => {
      const r = await revealHintAction(slug)
      if ('error' in r) toast.error(r.error)
      else setHints(r.hints)
    })
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Hints are progressive. Each one you open is recorded and lowers the effectiveness score a little.</p>
      <ol className="space-y-2">
        {hints.map((h, i) => (
          <li key={i} className="rounded-lg border p-3 text-sm" data-testid="hint">
            <span className="mr-2 font-medium">Hint {i + 1}.</span>
            {h}
          </li>
        ))}
      </ol>
      {hints.length < count ? (
        <Button type="button" size="sm" variant="outline" onClick={reveal} disabled={pending}>
          <Lightbulb aria-hidden />
          {pending ? 'Opening…' : `Show hint ${hints.length + 1} of ${count}`}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">All hints are open.</p>
      )}
    </div>
  )
}

export function SubmissionsList({ submissions, onLoad }: { submissions: SubmissionView[]; onLoad: (s: SubmissionView) => void }) {
  if (submissions.length === 0) return <p className="text-sm text-muted-foreground">No submissions yet. Submit runs every hidden test.</p>
  return (
    <ul className="space-y-2" aria-label="Your submissions">
      {submissions.map((s) => (
        <li key={s.id} className="rounded-lg border p-3" data-testid="submission">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={VERDICT_TONE[s.verdict]}>{VERDICT_LABELS[s.verdict] ?? s.verdict}</Badge>
            <span className="tabular-nums text-muted-foreground">
              {s.passed}/{s.total}
            </span>
            <span className="text-muted-foreground">{LANGUAGE_LABELS[s.language as CodeLanguage] ?? s.language}</span>
            <span className="tabular-nums text-muted-foreground">{formatMs(s.runtimeMs)}</span>
            <LocalTime date={s.createdAt} format="relative" className="ml-auto text-xs text-muted-foreground" />
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-primary">Show code</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-xs">{s.code}</pre>
            <Button type="button" size="sm" variant="ghost" className="mt-1" onClick={() => onLoad(s)}>
              Load into editor
            </Button>
          </details>
        </li>
      ))}
    </ul>
  )
}

function Solution({ slug, solution, solved, onUnlocked }: { slug: string; solution: SolutionView | null; solved: boolean; onUnlocked: (s: SolutionView) => void }) {
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const unlock = () =>
    start(async () => {
      const r = await unlockSolutionAction(slug)
      if ('error' in r) toast.error(r.error)
      else onUnlocked(r.solution)
    })
  if (!solution) {
    return (
      <div className="space-y-3 text-sm">
        <p className="flex items-center gap-2 text-muted-foreground">
          <Lock className="size-4" aria-hidden />
          The reference solution unlocks after an accepted submission{solved ? '' : ', or if you give up'}.
        </p>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setOpen(true)}>
          {solved ? 'View solution' : 'Give up and view solution'}
        </Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title={solved ? 'View the solution?' : 'Give up and view the solution?'}
          description={solved ? 'You solved this one; compare your approach.' : 'It is recorded as given up. You can still solve it afterwards for practice.'}
          confirmLabel="View solution"
          pending={pending}
          onConfirm={() => {
            setOpen(false)
            unlock()
          }}
        />
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <MarkdownText source={solution.approach} />
      <p className="text-xs text-muted-foreground">
        Reference in {solution.language === 'sql' ? 'SQL' : 'JavaScript'} · target {solution.target.time} time, {solution.target.space} space.
      </p>
      <pre className="overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs" data-testid="solution-code">
        {solution.code}
      </pre>
    </div>
  )
}

export interface StatementPanelProps {
  problem: PublicProblem
  skillName: string
  hints: string[]
  submissions: SubmissionView[]
  solution: SolutionView | null
  solved: boolean
  tab: string
  onTab: (tab: string) => void
  onSolution: (s: SolutionView) => void
  onLoadSubmission: (s: SubmissionView) => void
}

export function StatementPanel(p: StatementPanelProps) {
  return (
    <Tabs value={p.tab} onValueChange={p.onTab} className="flex h-full min-h-0 flex-col">
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="description">Description</TabsTrigger>
        <TabsTrigger value="hints">Hints</TabsTrigger>
        <TabsTrigger value="submissions">Submissions{p.submissions.length > 0 ? ` (${p.submissions.length})` : ''}</TabsTrigger>
        <TabsTrigger value="solution">Solution</TabsTrigger>
      </TabsList>
      <div className="min-h-0 flex-1 overflow-y-auto pt-3">
        <TabsContent value="description" className="mt-0">
          <Description problem={p.problem} skillName={p.skillName} />
        </TabsContent>
        <TabsContent value="hints" className="mt-0">
          <Hints slug={p.problem.slug} count={p.problem.hintCount} initial={p.hints} />
        </TabsContent>
        <TabsContent value="submissions" className="mt-0">
          <SubmissionsList submissions={p.submissions} onLoad={p.onLoadSubmission} />
        </TabsContent>
        <TabsContent value="solution" className="mt-0">
          <Solution slug={p.problem.slug} solution={p.solution} solved={p.solved} onUnlocked={p.onSolution} />
        </TabsContent>
      </div>
    </Tabs>
  )
}
