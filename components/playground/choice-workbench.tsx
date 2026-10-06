'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { CheckCircle2, XCircle } from 'lucide-react'
import { submitAttemptAction } from '@/app/(authed)/playground/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { levelName } from '@/lib/academy/levels'
import type { SubmitResult } from '@/lib/academy/service/submit'
import type { PlayView } from '@/lib/academy/service/views'
import { cn } from '@/lib/utils'
import { EvaluationPanel } from './evaluation-panel'
import { StartButton } from './start-button'

interface Outcome {
  view: PlayView
  extra: Pick<SubmitResult, 'levelBefore' | 'levelAfter' | 'earned' | 'next'> | null
}

function ChoiceList({
  view,
  selected,
  onSelect,
}: {
  view: PlayView
  selected: number | null
  onSelect: (i: number) => void
}) {
  const r = view.result
  return (
    <fieldset className="space-y-2" disabled={r !== null}>
      <legend className="sr-only">Choose one answer</legend>
      {view.choices.map((c) => {
        const isAnswer = r !== null && c.index === r.answer
        const isWrongPick = r !== null && c.index === r.chosen && !isAnswer
        return (
          <label
            key={c.index}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-accent/50',
              selected === c.index && r === null && 'border-ring bg-accent/40',
              isAnswer && 'border-success bg-success-soft',
              isWrongPick && 'border-danger bg-danger-soft',
              r !== null && 'cursor-default hover:bg-transparent',
            )}
          >
            <input
              type="radio"
              name="choice"
              className="mt-0.5 shrink-0 accent-primary"
              checked={(r ? r.chosen : selected) === c.index}
              onChange={() => onSelect(c.index)}
            />
            <span className="min-w-0 flex-1 break-words">{c.text}</span>
            {isAnswer ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-success">
                <CheckCircle2 className="size-3.5" aria-hidden /> Correct answer
              </span>
            ) : null}
            {isWrongPick ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-danger">
                <XCircle className="size-3.5" aria-hidden /> Your answer
              </span>
            ) : null}
          </label>
        )
      })}
    </fieldset>
  )
}

function ResultPanel({ outcome }: { outcome: Outcome }) {
  const r = outcome.view.result
  if (!r) return null
  const extra = outcome.extra
  const correct = r.chosen === r.answer
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2">
          {correct ? 'Correct' : 'Not quite'}
          <Badge variant="secondary" className="tabular-nums">
            +{r.xp} XP
          </Badge>
          {extra && extra.levelAfter > extra.levelBefore ? <Badge variant="success">Level up: {levelName(extra.levelAfter)}</Badge> : null}
          {extra?.earned.map((a) => (
            <Badge key={a.id} variant="info">
              Achievement: {a.name}
            </Badge>
          ))}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="break-words text-sm">{r.explanation}</p>
        <EvaluationPanel evaluation={r.evaluation} />
        <div className="flex flex-wrap gap-2">
          {extra?.next === 'placement' ? <StartButton kind="placement" label="Next placement item" variant="default" /> : null}
          <Button asChild size="sm" variant={extra?.next === 'placement' ? 'outline' : 'default'}>
            <Link href="/playground">Back to today&apos;s plan</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/playground/history">History</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/** The workbench for the built-in choice formats (concept check, predict the output). */
export function ChoiceWorkbench({ initial }: { initial: PlayView }) {
  const [outcome, setOutcome] = useState<Outcome>({ view: initial, extra: null })
  const [selected, setSelected] = useState<number | null>(null)
  const [pending, start] = useTransition()
  const view = outcome.view

  const submit = (): void => {
    if (selected === null) {
      toast.error('Pick an answer first.')
      return
    }
    start(async () => {
      const r = await submitAttemptAction(view.attemptId, selected)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      setOutcome({ view: r.view, extra: r.result })
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <p className="break-words text-base font-medium" data-testid="prompt">
            {view.prompt}
          </p>
          {view.code ? (
            <pre className="overflow-x-auto rounded-lg border bg-muted p-3 text-xs leading-relaxed" aria-label={`${view.language ?? 'Code'} snippet`}>
              <code>{view.code}</code>
            </pre>
          ) : null}
          <ChoiceList view={view} selected={selected} onSelect={setSelected} />
          {view.result ? null : (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" onClick={submit} disabled={pending || selected === null}>
                {pending ? 'Scoring…' : 'Submit answer'}
              </Button>
              <span className="text-xs text-muted-foreground">Par {view.parSec}s. Time counts a little; it is not a race.</span>
            </div>
          )}
        </CardContent>
      </Card>
      <ResultPanel outcome={outcome} />
    </div>
  )
}
