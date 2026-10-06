import { requireUserId } from '@/lib/auth/require-session'
import { GLOBAL_STEP_IDS, STEP_LABELS, USER_STEP_IDS, totalChanged } from '@/lib/db/retention/steps'
import { formatBytes } from '@/lib/usage/format'
import { getStoragePageData } from '@/lib/usage/storage'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CleanUpNowButton, RetentionWindowsForm } from '@/components/settings/storage-actions'
import { LocalTime } from '@/components/local-time'

export const dynamic = 'force-dynamic'
// "Clean up now" runs the cleanup in this function (bounded to 45 s).
export const maxDuration = 60

const TRIGGER_LABEL = { cron: 'nightly cleanup', manual: 'Clean up now', early: 'early cleanup (storage ≥ 90%)' } as const

function percent(share: number): string {
  if (share <= 0) return '0%'
  return share < 0.01 ? '<1%' : `${Math.round(share * 100)}%`
}

export default async function StoragePage() {
  const userId = await requireUserId()
  const data = await getStoragePageData(userId)
  const { lastRun, policy } = data.settings
  const changed = lastRun
    ? [...USER_STEP_IDS, ...GLOBAL_STEP_IDS].filter((id) => (lastRun.counts[id] ?? 0) > 0)
    : []

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Storage"
        description="What lee keeps in its database, and how long. Clutter such as stale discoveries, raw source payloads, old logs and finished jobs is cleaned every night at 03:30 UTC. Applications, saved jobs, notes and your documents are never removed."
        actions={<CleanUpNowButton />}
      />

      <Card data-testid="storage-last-run">
        <CardHeader className="pb-2">
          <CardTitle>Last cleanup</CardTitle>
          <CardDescription>
            {lastRun ? (
              <>
                <LocalTime date={lastRun.at} format="relative" titleFormat="datetime" />{' '}
                by the {TRIGGER_LABEL[lastRun.trigger]}: {totalChanged(lastRun.counts).toLocaleString('en-US')} rows
                removed or slimmed.
              </>
            ) : (
              'No cleanup has run yet: the first one runs tonight, or press Clean up now.'
            )}
          </CardDescription>
        </CardHeader>
        {changed.length > 0 ? (
          <CardContent>
            <ul className="divide-y text-sm">
              {changed.map((id) => (
                <li key={id} className="flex justify-between gap-3 py-1.5">
                  <span>{STEP_LABELS[id]}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {(lastRun?.counts[id] ?? 0).toLocaleString('en-US')}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Retention windows</CardTitle>
          <CardDescription>
            How long lee keeps data it can clean up. Queue jobs, Gmail sync markers and cached PDFs use fixed windows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RetentionWindowsForm policy={policy} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Storage per table</CardTitle>
          <CardDescription>
            {data.dbSizeBytes === null
              ? 'Database size is unavailable right now.'
              : `Database: ${formatBytes(data.dbSizeBytes)} of ${formatBytes(data.capBytes)}. Sizes include indexes and TOAST.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.tables.length === 0 ? (
            <p className="text-sm text-muted-foreground">Table sizes are unavailable right now.</p>
          ) : (
            <ul className="divide-y text-sm" data-testid="storage-tables">
              {data.tables.map((t) => (
                <li key={t.name} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="truncate font-mono text-xs">{t.name}</span>
                  <span className="flex shrink-0 gap-3 tabular-nums text-muted-foreground">
                    <span className="w-10 text-right">{percent(t.share)}</span>
                    <span className="w-20 text-right">{formatBytes(t.bytes)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
