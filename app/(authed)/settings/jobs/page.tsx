import { requireUserId } from '@/lib/auth/require-session'
import { getQueueOverview } from '@/lib/queue/overview'
import { JOB_STATUSES, type JobStatus } from '@/lib/queue/types'
import { relativeFromNow, shortDateTime } from '@/lib/ui/date'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RetryJobButton, RunJobsNowButton } from '@/components/settings/background-jobs-actions'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  done: 'Done',
  failed: 'Retrying',
  dead: 'Gave up',
}

export default async function BackgroundJobsPage() {
  const userId = await requireUserId()
  const overview = await getQueueOverview(userId)
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Background jobs"
        description="Gmail sync, discovery, follow-ups, digests and reminders run as small queued jobs a few times a day. Failed jobs retry with backoff; jobs that keep failing stop until you retry them."
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="text-base">Status</CardTitle>
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
              <time dateTime={overview.lastDrainAt.toISOString()} title={shortDateTime(overview.lastDrainAt)}>
                {relativeFromNow(overview.lastDrainAt)}
              </time>
            ) : (
              'not yet'
            )}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent failures</CardTitle>
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
                        attempt {f.attempts} of {f.maxAttempts} · {shortDateTime(f.updatedAt)}
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
