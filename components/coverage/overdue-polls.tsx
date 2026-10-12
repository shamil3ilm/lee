import { Clock } from 'lucide-react'
import { LocalTime } from '@/components/local-time'
import type { OverdueSource } from '@/lib/queue/overdue-polls'

export interface OverduePollView {
  id: string
  name: string
  lastPolledAt: string | null
  queuedSince: string | null
}

export function toOverdueViews(rows: readonly OverdueSource[]): OverduePollView[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    lastPolledAt: r.lastPolledAt ? r.lastPolledAt.toISOString() : null,
    queuedSince: r.queuedSince ? r.queuedSince.toISOString() : null,
  }))
}

const SHOWN = 8

/**
 * Settings › Sources › Coverage: enabled sources not checked for over a day.
 * They are first in line at the next background run (never-checked first).
 */
export function OverduePolls({ rows }: { rows: readonly OverduePollView[] }) {
  if (rows.length === 0) return null
  const rest = rows.length - SHOWN
  return (
    <div className="mb-4 rounded-md border border-amber-300/60 bg-amber-50/50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-950/20" data-testid="overdue-polls">
      <p className="flex items-center gap-2 font-medium">
        <Clock className="size-4" aria-hidden />
        {rows.length === 1 ? '1 source has' : `${rows.length} sources have`} not been checked for over a day
      </p>
      <p className="mt-1 text-muted-foreground">They go first at the next background run.</p>
      <ul className="mt-2 space-y-1">
        {rows.slice(0, SHOWN).map((r) => (
          <li key={r.id} className="flex flex-wrap gap-x-1">
            <span className="font-medium">{r.name}</span>
            <span className="text-muted-foreground">
              —{' '}
              {r.lastPolledAt ? (
                <>
                  last checked <LocalTime date={r.lastPolledAt} format="date" />
                </>
              ) : (
                'Not checked yet'
              )}
              {r.queuedSince ? (
                <>
                  {' '}
                  — queued since <LocalTime date={r.queuedSince} format="datetime" />
                </>
              ) : (
                ' — joins the next daily run'
              )}
            </span>
          </li>
        ))}
      </ul>
      {rest > 0 ? <p className="mt-1 text-muted-foreground">and {rest} more</p> : null}
    </div>
  )
}
