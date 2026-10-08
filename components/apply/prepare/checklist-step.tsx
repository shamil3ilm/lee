'use client'
import { useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { saveChecklistAction, skipStepAction } from '@/app/(authed)/shortlist/actions'
import type { ChecklistItem } from '@/lib/apply/checklist'
import type { PrepareView } from '@/lib/apply/prepare-view'
import { StepShell, toResult, useStepAction, type StepState } from './step-shell'
import { Checkbox } from '@/components/ui/checkbox'

function Item({
  item,
  checked,
  onChange,
  disabled,
}: {
  item: ChecklistItem
  checked: boolean
  onChange: (on: boolean) => void
  disabled: boolean
}) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <Checkbox
        id={`check-${item.id}`}
        className="mt-0.5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <label htmlFor={`check-${item.id}`} className="min-w-0 break-words">
        {item.label}
        {item.detail ? <span className="block text-xs text-muted-foreground">{item.detail}</span> : null}
      </label>
      {item.href ? (
        <a
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          Open
          <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      ) : null}
    </li>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  )
}

export function ChecklistStep({ view, state }: { view: PrepareView; state: StepState }) {
  const [pending, run] = useStepAction()
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set(view.progress.checklist?.checked ?? []))
  const set = (id: string, on: boolean): void =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  const list = view.checklist
  const row = (item: ChecklistItem) => (
    <Item key={item.id} item={item} checked={checked.has(item.id)} onChange={(on) => set(item.id, on)} disabled={pending} />
  )

  return (
    <StepShell
      n={4}
      title="Before you apply"
      state={state}
      summary={state === 'skipped' ? 'Skipped.' : 'Where to apply, what to attach and what the posting asks.'}
      testId="prepare-step-checklist"
    >
      <div className="space-y-3">
        <Group title="Where">{row(list.where)}</Group>
        <Group title="Documents">{list.documents.map(row)}</Group>
        {list.questions.length > 0 ? <Group title="Questions the posting asks">{list.questions.map(row)}</Group> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={state === 'current' ? 'default' : 'outline'}
          disabled={pending}
          onClick={() => run(() => saveChecklistAction(view.applicationId, [...checked]).then(toResult))}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {state === 'done' ? 'Save checklist' : 'Checklist done'}
        </Button>
        {state === 'current' ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => skipStepAction(view.applicationId, 'checklist').then(toResult))}>
            Skip
          </Button>
        ) : null}
      </div>
    </StepShell>
  )
}
