import Link from 'next/link'
import { ArrowRight, CheckCircle2, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { BannerFamily } from '@/components/discovery/defaults-banner'
import type { SetupChecklist, SetupItem, SetupItemKey } from '@/lib/journey/service'
import { withReturn } from '@/lib/ui/settings-links'
import { cn } from '@/lib/utils'
import { SetupSearchStep } from './setup-search-step'

const HOME = '/'

const STEP_COPY: Partial<Record<SetupItemKey, { hint: string; action: string }>> = {
  search_prefs: { hint: 'Roles, level and places. Discovery filters and ranks every job with them.', action: 'All preferences' },
  profile: { hint: 'lee reads your skills and experience from it to score every job.', action: 'Import CV' },
  source: { hint: 'Job boards and employer sites lee checks every morning.', action: 'Choose sources' },
  job_alerts: {
    hint: 'LinkedIn, Indeed, Bayt and others can email you alerts; lee reads them from Gmail (read-only).',
    action: 'Set up job alerts',
  },
}

interface SetupPanelProps {
  checklist: SetupChecklist
  /** Role families for the inline search step (unsaved preferences only). */
  families: readonly BannerFamily[] | null
  /** Opened from the "Setup" link after the panel retired. */
  reopened?: boolean
}

function StepRow({ item, n, current, families }: { item: SetupItem; n: number; current: boolean; families: readonly BannerFamily[] | null }) {
  const copy = STEP_COPY[item.key]
  const href = withReturn(item.href, HOME)
  return (
    <li
      className={cn('flex gap-3 rounded-lg px-3 py-2.5', current && 'border bg-muted')}
      data-step={item.key}
      data-state={item.done ? 'done' : current ? 'current' : 'todo'}
      aria-current={current ? 'step' : undefined}
    >
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {item.done ? (
          <CheckCircle2 className="size-5 text-success" />
        ) : (
          <span className="grid size-5 place-items-center rounded-full border text-[11px] font-medium tabular-nums">{n}</span>
        )}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className={cn('text-sm font-medium', item.done && 'text-muted-foreground')}>
            {item.label}
            <span className="sr-only">{item.done ? ' (done)' : ' (to do)'}</span>
          </span>
          {!current ? (
            <Link href={href} className="text-xs font-medium text-primary underline-offset-2 hover:underline">
              {item.done ? 'Review' : copy?.action ?? 'Open'}
            </Link>
          ) : null}
        </div>
        {current && copy ? <p className="text-xs text-muted-foreground">{copy.hint}</p> : null}
        {current ? (
          <div className="flex flex-wrap items-center gap-2">
            {item.key === 'search_prefs' && families ? <SetupSearchStep families={families} /> : null}
            <Button asChild size="sm" variant={item.key === 'search_prefs' && families?.length ? 'ghost' : 'default'}>
              <Link href={href}>
                {copy?.action ?? 'Open'}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  )
}

/**
 * First run on Home: four guided steps (what you're looking for, your CV,
 * your sources, job alerts), the first open one expanded with an inline
 * form or a link that comes back here. Progress is the user's own data, so
 * it is saved as they go. At 80% the panel folds into a "Setup" link.
 */
export function SetupPanel({ checklist, families, reopened = false }: SetupPanelProps) {
  const { items, completed, total } = checklist
  const guided = items.filter((i) => i.guided)
  const also = items.filter((i) => !i.guided)
  const currentKey = guided.find((i) => !i.done)?.key ?? null
  const pct = total === 0 ? 100 : Math.round((completed / total) * 100)

  return (
    <section id="setup" aria-labelledby="setup-title" className="scroll-mt-20" data-testid="setup-panel">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
          <div className="min-w-0 flex-1 space-y-2">
            <CardTitle id="setup-title">{completed >= total ? 'You are all set up' : 'Get set up'}</CardTitle>
            <div
              className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={completed}
              aria-label="Setup progress"
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {completed} of {total} done
            </p>
          </div>
          {reopened ? (
            <Button asChild size="sm" variant="ghost">
              <Link href="/">Hide</Link>
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <ol className="space-y-1" aria-label="Setup steps">
            {guided.map((item, i) => (
              <StepRow key={item.key} item={item} n={i + 1} current={item.key === currentKey} families={families} />
            ))}
          </ol>
          {also.some((i) => !i.done) ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-xs">
              <span className="text-muted-foreground">Also:</span>
              {also.map((item) => (
                <Link
                  key={item.key}
                  href={withReturn(item.href, HOME)}
                  className={cn(
                    'inline-flex items-center gap-1 underline-offset-2 hover:underline',
                    item.done ? 'text-muted-foreground line-through' : 'font-medium text-primary',
                  )}
                >
                  {item.done ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : <Circle className="size-3.5" aria-hidden="true" />}
                  {item.label}
                  <span className="sr-only">{item.done ? ' (done)' : ' (to do)'}</span>
                </Link>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  )
}
