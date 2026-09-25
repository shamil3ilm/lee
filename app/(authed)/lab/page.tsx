import Link from 'next/link'
import { ExternalLink, Swords } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import * as runsQ from '@/lib/db/queries/labRuns'
import { getProviderStatuses } from '@/lib/lab/status'
import { summarizeRun } from '@/lib/lab/run-summary'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { KeyStatusBadge } from '@/components/lab/key-status-badge'
import { RecentRuns } from '@/components/lab/recent-runs'
import { WinRateTable } from '@/components/lab/win-rate-table'

export const dynamic = 'force-dynamic'

export default async function LabHubPage() {
  const userId = await requireUserId()
  const [statuses, runs, rates] = await Promise.all([
    getProviderStatuses(userId),
    runsQ.listRuns(userId, 10),
    runsQ.winRates(userId),
  ])
  const now = new Date()
  return (
    <div className="space-y-8">
      <PageHeader
        title="Model Lab"
        description="Try free open-source models, compare them side by side, and keep score."
        actions={
          <Button asChild size="sm">
            <Link href="/lab/arena">
              <Swords /> Open Arena
            </Link>
          </Button>
        }
      />

      <section aria-labelledby="lab-providers" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="lab-providers" className="text-lg font-semibold">
            Providers
          </h2>
          <Link href="/lab/providers" className="text-sm text-muted-foreground hover:text-foreground">
            Manage keys
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {statuses.map((s) => (
            <Card key={s.info.id} className="flex flex-col">
              <CardHeader className="space-y-2 p-4 pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-sm">{s.info.label}</CardTitle>
                  <KeyStatusBadge
                    keySource={s.keySource}
                    last4={s.last4}
                    needsKey={s.info.needsKey}
                    comingSoon={s.info.comingSoon}
                  />
                </div>
                <CardDescription className="text-xs">{s.info.freeTierNote}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto p-4 pt-0">
                <a
                  href={s.info.docsUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Docs <ExternalLink className="size-3" />
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="lab-runs" className="space-y-3">
          <h2 id="lab-runs" className="text-lg font-semibold">
            Recent runs
          </h2>
          <RecentRuns runs={runs.map(summarizeRun)} now={now} />
        </section>
        <section aria-labelledby="lab-leaderboard" className="space-y-3">
          <h2 id="lab-leaderboard" className="text-lg font-semibold">
            Your blind-vote leaderboard
          </h2>
          <WinRateTable rows={rates} />
        </section>
      </div>
    </div>
  )
}
