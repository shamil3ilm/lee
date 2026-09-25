import Link from 'next/link'
import {
  AlarmClock,
  ArrowRight,
  Briefcase,
  MessageSquareText,
  NotebookPen,
  Send,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { NextActionKind, NextBestAction as NextBestActionData } from '@/lib/journey/service'

const ICONS: Record<NextActionKind, LucideIcon> = {
  overdue_todo: AlarmClock,
  interview_prep: NotebookPen,
  debrief: MessageSquareText,
  follow_up: Send,
  discovery: Sparkles,
  add_application: Briefcase,
}

interface NextBestActionProps {
  action: NextBestActionData
}

export function NextBestAction({ action }: NextBestActionProps) {
  const Icon = ICONS[action.kind]
  return (
    <section
      aria-label="Next best action"
      className="flex flex-col gap-4 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Next best action
          </p>
          <p className="font-medium">{action.title}</p>
          <p className="text-sm text-muted-foreground">{action.description}</p>
        </div>
      </div>
      <Button asChild className="shrink-0 self-start sm:self-center">
        <Link href={action.href}>
          {action.ctaLabel}
          <ArrowRight className="size-4" />
        </Link>
      </Button>
    </section>
  )
}
