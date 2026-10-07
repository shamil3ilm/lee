'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, CircleDashed, Minus } from 'lucide-react'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type StepState = 'done' | 'skipped' | 'current' | 'upcoming'

const STATE: Record<StepState, { label: string; variant: BadgeProps['variant'] }> = {
  done: { label: 'Done', variant: 'success' },
  skipped: { label: 'Skipped', variant: 'neutral' },
  current: { label: 'Next', variant: 'info' },
  upcoming: { label: 'Up next', variant: 'outline' },
}

function Marker({ n, state }: { n: number; state: StepState }) {
  const base = 'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums'
  if (state === 'done') {
    return (
      <span className={cn(base, 'border-transparent bg-success-soft text-success')} aria-hidden="true">
        <Check className="size-4" />
      </span>
    )
  }
  if (state === 'skipped') {
    return (
      <span className={cn(base, 'border-transparent bg-neutral-soft text-neutral')} aria-hidden="true">
        <Minus className="size-4" />
      </span>
    )
  }
  return (
    <span className={cn(base, state === 'current' ? 'border-primary text-primary' : 'text-muted-foreground')} aria-hidden="true">
      {state === 'current' ? n : <CircleDashed className="size-4" />}
    </span>
  )
}

/** One numbered step of the Prepare panel: marker, title, state, body. */
export function StepShell({
  n,
  title,
  state,
  summary,
  children,
  testId,
}: {
  n: number
  title: string
  state: StepState
  summary?: React.ReactNode
  children?: React.ReactNode
  testId?: string
}) {
  return (
    <li className="rounded-xl border bg-card p-4 shadow-sm" data-testid={testId} data-state={state}>
      <div className="flex items-start gap-3">
        <Marker n={n} state={state} />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              <span className="sr-only">Step {n}: </span>
              {title}
            </h2>
            <Badge variant={STATE[state].variant}>{STATE[state].label}</Badge>
          </div>
          {summary ? <div className="text-sm text-muted-foreground">{summary}</div> : null}
          {children}
        </div>
      </div>
    </li>
  )
}

/** Run a step action with a pending state, a toast on error and a refresh on success. */
export function useStepAction(): [boolean, (run: () => Promise<{ error?: string; ok?: string } | void>) => void] {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const go = (run: () => Promise<{ error?: string; ok?: string } | void>): void =>
    startTransition(async () => {
      try {
        const r = await run()
        if (r?.error) {
          toast.error(r.error)
          return
        }
        if (r?.ok) toast.success(r.ok)
        router.refresh()
      } catch {
        toast.error('Something went wrong. Try again.')
      }
    })
  return [pending, go]
}

/** A server action's ActionResult → the step runner's shape. */
export function toResult(r: { success: true } | { error: string }): { error?: string } {
  return 'error' in r ? { error: r.error } : {}
}
