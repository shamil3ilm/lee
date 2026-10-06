import Link from 'next/link'
import { CalendarCheck, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import type { PlanItem } from '@/lib/academy/selector/types'
import { PLAN_KIND_BADGE, PLAN_KIND_LABELS } from './labels'
import { StartButton } from './start-button'

function PlanRow({ item }: { item: PlanItem }) {
  const done = item.status === 'done'
  const reason = item.reasons[0]?.text ?? ''
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between" data-testid="plan-item">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={PLAN_KIND_BADGE[item.kind]}>{PLAN_KIND_LABELS[item.kind]}</Badge>
          <span className="min-w-0 break-words text-sm font-medium">{item.title}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{item.minutes} min</span>
        </div>
        {reason ? (
          <p className="break-words text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Why this? </span>
            {reason}
          </p>
        ) : null}
      </div>
      <div className="shrink-0">
        {done ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
            <CheckCircle2 className="size-3.5" aria-hidden />
            Done
            {item.attemptId ? (
              <Link href={`/playground/play/${item.attemptId}`} className="ml-1 text-primary underline-offset-4 hover:underline">
                See result
              </Link>
            ) : null}
          </span>
        ) : (
          <StartButton kind="plan" id={item.id} label="Start" ariaLabel={`Start: ${item.title}`} />
        )}
      </div>
    </li>
  )
}

export function PlanCard({ items, budget }: { items: PlanItem[]; budget: number }) {
  const minutes = items.reduce((m, i) => m + i.minutes, 0)
  const done = items.filter((i) => i.status === 'done').length
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-3">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck className="size-4 text-muted-foreground" aria-hidden />
            Today&apos;s plan
          </CardTitle>
          <CardDescription>
            About {minutes} of your {budget} minutes. Each item says why it was picked.
          </CardDescription>
        </div>
        <Badge variant="secondary" className="shrink-0 tabular-nums">
          {done}/{items.length} done
        </Badge>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState size="sm" title="Nothing planned" description="Add a skill to practise from the skill pages." />
        ) : (
          <ul className="divide-y" aria-label="Today's plan">
            {items.map((i) => (
              <PlanRow key={i.id} item={i} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
