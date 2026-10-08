import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { focusRing } from '@/components/ui/focus-ring'
import { relativeFromNow, shortDate } from '@/lib/ui/date'
import { joinMeta } from '@/lib/ui/meta'
import { APPLICATION_STATUSES, STATUS_BADGE, STATUS_LABELS, type ApplicationStatus } from '@/lib/ui/status'
import { cn } from '@/lib/utils'
import type { AppRow } from '@/components/applications-table'

function narrow(status: string): ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(status) ? (status as ApplicationStatus) : 'saved'
}

/** "Applied Sep 27 · Next in 2d (Oct 10)" from the dates that are present. */
export function appRowMeta(r: Pick<AppRow, 'appliedAt' | 'nextActionAt'>): string {
  return joinMeta([
    r.appliedAt ? `Applied ${shortDate(r.appliedAt)}` : null,
    r.nextActionAt ? `Next ${relativeFromNow(r.nextActionAt)} (${shortDate(r.nextActionAt)})` : null,
  ])
}

/**
 * Applications on phones: one stacked row per application (company and role,
 * the status badge on the right, dates underneath) so Status never scrolls
 * off-screen inside a table wrapper. The table takes over from `sm` up.
 */
export function ApplicationsStackedList({ rows }: { rows: readonly AppRow[] }) {
  return (
    <ul className="divide-y rounded-lg border bg-card sm:hidden" data-testid="applications-stacked">
      {rows.map((r) => {
        const s = narrow(r.status)
        const meta = appRowMeta(r)
        return (
          <li key={r.id}>
            <Link
              href={`/applications/${r.id}`}
              className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 px-3 py-2.5 hover:bg-muted/50', focusRing)}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{r.job.company?.name ?? 'Unknown company'}</span>
                <span className="block truncate text-sm text-foreground/90">{r.job.title}</span>
              </span>
              <Badge variant={STATUS_BADGE[s]} className="mt-0.5">
                {STATUS_LABELS[s]}
              </Badge>
              {meta ? <span className="col-span-2 text-xs text-muted-foreground">{meta}</span> : null}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
