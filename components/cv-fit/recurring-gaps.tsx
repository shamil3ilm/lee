'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { BookOpen, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { addStudyLabelAction } from '@/app/(authed)/cv-fit-actions'

export interface RecurringGapItem {
  label: string
  count: number
  playground: string[]
}

function AddButton({ label, onDone, done }: { label: string; onDone: () => void; done: boolean }) {
  const [pending, start] = useTransition()
  if (done) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
        <Check className="size-3.5" aria-hidden="true" />
        On your study list
      </span>
    )
  }
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-8"
      disabled={pending}
      aria-label={`Add to study list: ${label}`}
      onClick={() =>
        start(async () => {
          const r = await addStudyLabelAction(label)
          if ('error' in r) toast.error(r.error)
          else {
            toast.success(r.created ? `${label} is on your study list` : `${label} was already on your study list`)
            onDone()
          }
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <BookOpen className="size-4" />}
      Add to study list
    </Button>
  )
}

/** The must-haves your open postings miss most often this month, as study suggestions. */
export function RecurringGaps({ gaps }: { gaps: readonly RecurringGapItem[] }) {
  const [done, setDone] = useState<ReadonlySet<string>>(new Set())
  if (gaps.length === 0) return <p className="text-sm text-muted-foreground">No must-have keeps coming up missing this month.</p>
  return (
    <ul className="divide-y rounded-lg border" aria-label="Recurring missing must-haves" data-testid="recurring-gaps">
      {gaps.map((g) => (
        <li key={g.label} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <span className="min-w-0">
            <span className="text-sm font-medium">{g.label}</span>
            <span className="block text-xs text-muted-foreground">
              Missing in {g.count} postings{g.playground.length > 0 ? ` · Playground: ${g.playground.join(', ')}` : ''}
            </span>
          </span>
          <AddButton label={g.label} done={done.has(g.label)} onDone={() => setDone((prev) => new Set([...prev, g.label]))} />
        </li>
      ))}
    </ul>
  )
}
