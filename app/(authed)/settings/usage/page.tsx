import Link from 'next/link'
import { requireUserId } from '@/lib/auth/require-session'
import { relativeFromNow, shortDateTime } from '@/lib/ui/date'
import { TONE_BORDER, TONE_SOFT } from '@/lib/ui/tones'
import { cn } from '@/lib/utils'
import { formatBytes } from '@/lib/usage/format'
import { VERCEL_USAGE_DASHBOARD_URL } from '@/lib/usage/limits'
import { getUsagePageData } from '@/lib/usage/page-data'
import type { MeterView } from '@/lib/usage/view-model'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AiQuotaMeters } from '@/components/analytics/ai-quota-meters'
import { UsageMeterRow } from '@/components/settings/usage-meters'
import { NeonProjectForm, RefreshUsageButton, ResumeThrottleButton } from '@/components/settings/usage-actions'

export const dynamic = 'force-dynamic'
// "Refresh now" runs the snapshot (Neon API calls, early retention) in this function.
export const maxDuration = 60

const GROUPS: { id: MeterView['group']; title: string; description: string }[] = [
  {
    id: 'neon',
    title: 'Neon Free (database)',
    description: 'When compute or egress runs out, Neon suspends the database until next month and lee goes down. No data is lost.',
  },
  {
    id: 'vercel',
    title: 'Vercel Hobby (hosting)',
    description:
      'Vercel has no usage API for Hobby accounts, so these limits are shown for reference. Check the real numbers on the Vercel dashboard.',
  },
  {
    id: 'app',
    title: 'lee’s own budgets',
    description: 'Limits lee sets itself to stay inside the free tiers.',
  },
]

export default async function UsagePage() {
  const userId = await requireUserId()
  const data = await getUsagePageData(userId)
  const requested = data.throttles.filter((t) => t.requested)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Usage"
        description="lee runs on Neon Free and Vercel Hobby. Meters turn amber at 70% and red at 90%; at 90% lee throttles itself before a hard stop."
        actions={<RefreshUsageButton />}
      />

      <p className="text-sm text-muted-foreground" data-testid="usage-snapshot-at">
        {data.snapshotAt ? (
          <>
            Last snapshot{' '}
            <time dateTime={data.snapshotAt.toISOString()} title={shortDateTime(data.snapshotAt)}>
              {relativeFromNow(data.snapshotAt)}
            </time>
            . Database size and your files are live; the rest updates daily or when you refresh.
          </>
        ) : (
          'No snapshot yet: the first one runs with the daily jobs, or press Refresh now.'
        )}
      </p>

      {requested.length > 0 ? (
        <Card className={cn('border', TONE_BORDER.warning)} data-testid="usage-throttles">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Automatic throttles</CardTitle>
            <CardDescription>Reversible: each lifts when usage drops under 90% or the month resets.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {requested.map((t) => (
              <div key={t.id} className={cn('rounded-md p-3 text-sm', TONE_SOFT[t.active ? 'warning' : 'neutral'])}>
                <div className="font-medium">
                  {t.title}
                  {t.active ? '' : ' (resumed by you this month)'}
                </div>
                <p className="mt-1 text-xs">{t.detail}</p>
              </div>
            ))}
            {requested.some((t) => t.id === 'pause_nonessential') ? (
              <ResumeThrottleButton resumed={data.resumed} />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {GROUPS.map((g) => {
        const meters = data.meters.filter((m) => m.group === g.id)
        return (
          <Card key={g.id} data-testid={`usage-group-${g.id}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{g.title}</CardTitle>
              <CardDescription>{g.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {meters.map((m) => (
                  <UsageMeterRow key={m.id} meter={m} />
                ))}
              </ul>
              {g.id === 'neon' && data.neon.computeState ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Compute state at the last snapshot: {data.neon.computeState}. It scales to zero after 5 idle minutes.
                </p>
              ) : null}
              {g.id === 'vercel' ? (
                <a
                  href={VERCEL_USAGE_DASHBOARD_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 inline-block text-sm underline-offset-2 hover:underline"
                >
                  Open Vercel usage
                </a>
              ) : null}
            </CardContent>
          </Card>
        )
      })}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">AI tokens and quotas (today)</CardTitle>
          <CardDescription>
            Per-model free-tier limits reset daily. More detail in{' '}
            <Link href="/analytics" className="underline-offset-2 hover:underline">
              Analytics
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AiQuotaMeters meters={data.ai} />
        </CardContent>
      </Card>

      {data.largestTables.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Largest tables</CardTitle>
            <CardDescription>Table, indexes and TOAST together, at the last snapshot.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm" data-testid="usage-largest-tables">
              {data.largestTables.map((t) => (
                <li key={t.name} className="flex justify-between gap-3 py-1.5">
                  <span className="truncate font-mono text-xs">{t.name}</span>
                  <span className="tabular-nums text-muted-foreground">{formatBytes(t.bytes)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Neon connection</CardTitle>
          <CardDescription>
            Optional. With a Neon API key, snapshots also read compute (CU-hours), egress and compute state. Add the key
            under{' '}
            <Link href="/settings/ai#service-keys" className="underline-offset-2 hover:underline">
              Settings › AI › Service keys
            </Link>
            ; it stays encrypted on the server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm" data-testid="usage-neon-status">
            {data.neon.keySource === 'none'
              ? 'No Neon key: compute and egress are not measured.'
              : data.neon.error
                ? `Key set, but the last snapshot could not read usage: ${data.neon.error}`
                : data.neon.connected
                  ? 'Connected: the last snapshot read usage from the Neon API.'
                  : 'Key set: usage is read at the next snapshot or refresh.'}
          </p>
          <NeonProjectForm projectId={data.neon.projectId} />
        </CardContent>
      </Card>
    </div>
  )
}
