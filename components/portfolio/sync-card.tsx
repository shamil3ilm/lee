import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { SyncStatus } from '@/lib/portfolio/sync-status'
import { LOCKED_MESSAGE } from '@/lib/portfolio/sync-flags'
import { SyncLine } from './sync-line'

/** Settings › Profile: a small card linking to the portfolio sync. */
export function PortfolioSyncCard({ status }: { status: SyncStatus }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Portfolio</CardTitle>
        <CardDescription>
          {status.locked
            ? `Your public profile (Résumé) comes from your portfolio’s profile.json. ${LOCKED_MESSAGE}`
            : 'Connect your portfolio repository and lee keeps your public profile in sync with its profile.json.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status.locked || status.repoConfigured ? <SyncLine pulledLabel={status.pulledLabel} error={status.error} editUrl={status.editUrl} /> : null}
        <Link href="/settings/publish#portfolio-sync" className="inline-block text-sm text-primary underline underline-offset-2">
          Sync with portfolio
        </Link>
      </CardContent>
    </Card>
  )
}

/** Résumé: why public facts are read-only, with the sync line. */
export function PortfolioLockBanner({ status }: { status: SyncStatus }) {
  return (
    <section aria-label="Portfolio sync" className="space-y-2 rounded-md border border-info/40 bg-info-soft/40 p-3" data-testid="portfolio-lock">
      <p className="text-sm font-medium">{LOCKED_MESSAGE}</p>
      <p className="text-xs text-muted-foreground">
        Names, dates, highlights and the other public facts are shown as pulled. Readiness, wordings, skill kinds, stack and private items stay editable here.
      </p>
      <SyncLine pulledLabel={status.pulledLabel} error={status.error} editUrl={status.editUrl} />
    </section>
  )
}
