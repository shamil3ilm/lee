import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { InterestStars } from '@/components/interest-stars'
import { cn } from '@/lib/utils'
import { isWithinDays, relativeFromNow } from '@/lib/ui/date'
import {
  APPLICATION_STATUSES,
  STATUS_ACCENT,
  STATUS_LABELS,
  type ApplicationStatus,
} from '@/lib/ui/status'

export interface KanbanCard {
  id: string
  title: string
  companyName: string | null
  interestLevel: number | null
  nextActionAt: string | null
}

export interface KanbanColumn {
  status: ApplicationStatus
  cards: KanbanCard[]
}

interface KanbanProps {
  columns: KanbanColumn[]
}

export function Kanban({ columns }: KanbanProps) {
  const ordered = APPLICATION_STATUSES.map(
    (s) => columns.find((c) => c.status === s) ?? { status: s, cards: [] as KanbanCard[] },
  )
  return (
    <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
      {ordered.map((col) => (
        <div
          key={col.status}
          className="flex w-72 shrink-0 snap-start flex-col rounded-lg border bg-muted/30"
        >
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className={cn('text-xs font-semibold uppercase tracking-wide', STATUS_ACCENT[col.status])}>
              {STATUS_LABELS[col.status]}
            </div>
            <span className="rounded bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {col.cards.length}
            </span>
          </div>
          <div className="flex-1 space-y-2 p-2">
            {col.cards.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">No applications</div>
            ) : (
              col.cards.map((c) => (
                <Link
                  key={c.id}
                  href={`/applications/${c.id}`}
                  className="block rounded-md border bg-card p-3 text-sm shadow-sm transition-colors hover:border-foreground/30"
                >
                  <div className="font-medium leading-tight">{c.companyName ?? 'Unknown'}</div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {c.title}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <InterestStars level={c.interestLevel} />
                    {c.nextActionAt && isWithinDays(c.nextActionAt, 7) ? (
                      <Badge variant="outline" className="text-[10px]">
                        {relativeFromNow(c.nextActionAt)}
                      </Badge>
                    ) : null}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
