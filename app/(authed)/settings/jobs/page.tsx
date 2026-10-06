import Link from 'next/link'
import { requireUserId } from '@/lib/auth/require-session'
import { jobLabel } from '@/lib/queue/job-types'
import { getQueueOverview } from '@/lib/queue/overview'
import { getLastRuns, getRunHistory } from '@/lib/queue/runs'
import { JOB_STATUSES } from '@/lib/queue/types'
import { relativeFromNow } from '@/lib/ui/date'
import { JOB_STATUS_LABEL as STATUS_LABEL } from '@/lib/ui/run-status'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RetryJobButton, RunJobsNowButton } from '@/components/settings/background-jobs-actions'
import { LastRunsTable, RunHistory } from '@/components/settings/last-runs'
import { LocalTime } from '@/components/local-time'

export const dynamic = 'force-dynamic'

interface BackgroundJobsPageProps {
  searchParams: Promise<{ history?: string }>
}

export default async function BackgroundJobsPage({ searchParams }: BackgroundJobsPageProps) {
  const userId = await requireUserId()
  const sp = await searchParams
  // Only a short, known-shaped type name is queried (never used as HTML).
  const history = typeof sp.history === 'string' && /^[a-z+:-]{1,64}$/.test(sp.history) ? sp.history : null
  const [overview, lastRuns, runs] = await Promise.all([
    getQueueOverview(userId),
    getLastRuns(userId),
    history ? getRunHistory(userId, history) : Promise.resolve([]),
  ])
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Background jobs"
        description="Gmail sync, discovery, follow-ups, digests and reminders run as small queued jobs a few times a day. Failed jobs retry with backoff; jobs that keep failing stop until you retry them."
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle>Status</CardTitle>
          <RunJobsNowButton />
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="job-counts">
            {JOB_STATUSES.map((s) => (
              <div key={s} className="rounded-md border p-3">
                <dt className="text-xs text-muted-foreground">{STATUS_LABEL[s]}</dt>
                <dd className="text-2xl font-semibold tabular-nums">{overview.counts[s]}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted-foreground">
            Last run for your jobs:{' '}
            {overview.lastDrainAt ? (
              <LocalTime date={overview.lastDrainAt} format="relative" titleFormat="datetime" />
            ) : (
              'not yet'
            )}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle>Last runs</CardTitle>
          <Link href="/settings/logs?category=job" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
            Job logs
          </Link>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Pick a job to see its last 20 runs with results and errors. Runs are kept for 14 days (30 when a
            job gave up).
          </p>
          <LastRunsTable rows={lastRuns} selected={history} />
        </CardContent>
      </Card>

      {history ? (
        <Card id="run-history">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <CardTitle>Run history: {jobLabel(history)}</CardTitle>
            <Link href="/settings/jobs" scroll={false} className="text-sm text-muted-foreground underline-offset-2 hover:underline">
              Close
            </Link>
          </CardHeader>
          <CardContent>
            <RunHistory label={jobLabel(history)} runs={runs} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Recent failures</CardTitle>
        </CardHeader>
        <CardContent>
          {overview.failures.length === 0 ? (
            <p className="text-sm text-muted-foreground">No failures. Everything ran cleanly.</p>
          ) : (
            <ul className="divide-y">
              {overview.failures.map((f) => (
                <li key={f.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{f.label}</span>
                      <Badge variant={f.status === 'dead' ? 'rose' : 'slate'}>{STATUS_LABEL[f.status]}</Badge>
                      <span className="text-xs text-muted-foreground">
                        attempt {f.attempts} of {f.maxAttempts} · <LocalTime date={f.updatedAt} />
                      </span>
                    </div>
                    {f.error ? <p className="break-words text-sm text-muted-foreground">{f.error}</p> : null}
                    {f.retryAt ? (
                      <p className="text-xs text-muted-foreground">Retries {relativeFromNow(f.retryAt)}</p>
                    ) : null}
                  </div>
                  {f.status === 'dead' ? <RetryJobButton id={f.id} /> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
