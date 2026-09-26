import Link from 'next/link'
import { AlertCircle, Bell, CheckCircle2, Mail, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { relativeFromNow } from '@/lib/ui/date'

interface SyncStatusProps {
  /** Google account is missing gmail.readonly — show the connect banner. */
  connected: boolean
  /** ISO timestamp of the last successful Gmail sync, if any. */
  syncedGmailAt: string | null
  /** Number of email activities logged in the last 24h. */
  emailsToday: number
  /** Applications with next_action_at in the next 3 days that need attention. */
  needsFollowUp: number
}

/**
 * Compact dashboard widget showing Google integration health.
 *
 * Two states:
 *  1. Connected — pill row of "synced N ago · X emails today · Y follow-ups"
 *  2. Not connected — yellow banner linking to /settings/integrations
 *
 * Server component: no client state needed; render straight from props the
 * dashboard already queries.
 */
export function SyncStatus({
  connected,
  syncedGmailAt,
  emailsToday,
  needsFollowUp,
}: SyncStatusProps) {
  if (!connected) {
    return (
      <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-900/60 dark:bg-yellow-950/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
          {/* One flowing paragraph: as three flex items the title was
              squeezed into a narrow column on phones (v17 §9.1). */}
          <div className="flex min-w-0 items-start gap-2 text-yellow-900 dark:text-yellow-200">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p>
              <span className="font-medium">Gmail not connected</span>{' '}
              <span className="opacity-80">
                — reconnect Google to auto-log emails and push interviews to Calendar.
              </span>
            </p>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link href="/settings/integrations">Connect Gmail</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <RefreshCw className="size-3.5" />
          <span>Synced</span>
          <span className="font-medium text-foreground">
            {syncedGmailAt ? relativeFromNow(syncedGmailAt) : 'never'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Mail className="size-3.5 text-blue-600 dark:text-blue-400" />
          <span className="font-medium text-foreground">{emailsToday}</span>
          <span>new email{emailsToday === 1 ? '' : 's'} today</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {needsFollowUp === 0 ? (
            <CheckCircle2 className="size-3.5 text-emerald-500" />
          ) : (
            <Bell className="size-3.5 text-amber-500" />
          )}
          <span className="font-medium text-foreground">{needsFollowUp}</span>
          <span>need{needsFollowUp === 1 ? 's' : ''} follow-up</span>
        </div>
        <Button asChild variant="ghost" size="sm" className="ml-auto h-7 text-xs">
          <Link href="/settings/integrations">Manage</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
