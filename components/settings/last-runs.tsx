import Link from 'next/link'
import { ScrollText } from 'lucide-react'
import type { JobRunView, LastRunRow } from '@/lib/queue/runs'
import { relativeFromNow, shortDateTime } from '@/lib/ui/date'
import { formatDuration, JOB_STATUS_LABEL, JOB_STATUS_TONE } from '@/lib/ui/run-status'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

/** Relative time with the absolute time underneath (server-rendered). */
function When({ at }: { at: Date }) {
  return (
    <time dateTime={at.toISOString()} title={at.toISOString()} className="block">
      <span className="block">{relativeFromNow(at)}</span>
      <span className="block text-xs text-muted-foreground">{shortDateTime(at)}</span>
    </time>
  )
}

function lastAt(run: JobRunView): Date {
  return run.finishedAt ?? run.startedAt ?? run.updatedAt
}

export function historyHref(type: string): string {
  return `/settings/jobs?history=${encodeURIComponent(type)}#run-history`
}

/** One row per job type: last run, status, duration, summary, next run. */
export function LastRunsTable({ rows, selected }: { rows: LastRunRow[]; selected: string | null }) {
  return (
    <Table data-testid="last-runs">
      <TableHeader>
        <TableRow>
          <TableHead>Job</TableHead>
          <TableHead>Last run</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Duration</TableHead>
          <TableHead>Result</TableHead>
          <TableHead>Next</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const last = r.last
          const isSelected = selected === r.type
          return (
            <TableRow
              key={r.type}
              data-testid="last-run-row"
              data-type={r.type}
              className={cn(isSelected && 'bg-accent')}
            >
              <TableCell className="font-medium">
                <Link
                  href={historyHref(r.type)}
                  scroll={false}
                  aria-current={isSelected ? 'true' : undefined}
                  className="underline-offset-2 hover:underline"
                >
                  {r.label}
                </Link>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {last ? <When at={lastAt(last)} /> : <span className="text-muted-foreground">Never</span>}
              </TableCell>
              <TableCell>
                {last ? (
                  <Badge variant={JOB_STATUS_TONE[last.status]}>{JOB_STATUS_LABEL[last.status]}</Badge>
                ) : (
                  <Badge variant="neutral">Not run</Badge>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right tabular-nums">
                {formatDuration(last?.durationMs)}
              </TableCell>
              <TableCell className="max-w-[18rem] text-sm">
                {last ? (
                  <span className={cn('line-clamp-2', last.status !== 'done' && 'text-danger')}>
                    {last.status === 'done' ? last.summaryLine || '—' : (last.lastError ?? last.summaryLine) || '—'}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm">
                <When at={r.nextAt} />
                {r.pending ? <span className="block text-xs text-muted-foreground">queued</span> : null}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

/** The last runs of one job type with their result details and errors. */
export function RunHistory({ label, runs }: { label: string; runs: JobRunView[] }) {
  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">No runs of {label} in the last 14 days.</p>
  }
  return (
    <ol className="divide-y" data-testid="run-history">
      {runs.map((run) => (
        <li key={run.id} className="space-y-1.5 py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={JOB_STATUS_TONE[run.status]}>{JOB_STATUS_LABEL[run.status]}</Badge>
            <time dateTime={lastAt(run).toISOString()} className="font-medium">
              {shortDateTime(lastAt(run))}
            </time>
            <span className="text-xs text-muted-foreground">
              attempt {run.attempts} of {run.maxAttempts} · {formatDuration(run.durationMs)}
              {run.mine ? '' : ' · all users'}
            </span>
            <Link
              href={`/settings/logs?job=${run.id}&range=60d`}
              className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              <ScrollText className="size-3.5" aria-hidden />
              Logs
            </Link>
          </div>
          {run.summaryLine ? <p className="text-sm">{run.summaryLine}</p> : null}
          {run.errors.length > 0 ? (
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {run.errors.map((e) => (
                <li key={`${e.attempt}-${e.at}`} className="break-words">
                  <span className="font-medium text-danger">Attempt {e.attempt}:</span> {e.message}
                </li>
              ))}
            </ul>
          ) : run.lastError ? (
            <p className="break-words text-xs text-danger">{run.lastError}</p>
          ) : null}
        </li>
      ))}
    </ol>
  )
}
