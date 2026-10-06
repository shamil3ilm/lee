'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  Loader2,
  Mail,
  Plug,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { APP_NAME } from '@/lib/brand'
import { LastActivity, type LastActivityItem } from '@/components/settings/last-activity'
import { LocalTime } from '@/components/local-time'

interface IntegrationsPanelProps {
  email: string | null
  scopes: string[]
  syncedGmailAt: string | null
  syncedCalendarAt: string | null
  /** Latest persisted Gmail / Calendar events (Settings › Logs). */
  gmailActivity?: LastActivityItem | null
  calendarActivity?: LastActivityItem | null
}

/**
 * The full scope list we request from Google. Order matches the consent
 * screen for clarity when the user checks their granted scopes.
 */
const REQUIRED_SCOPES: Array<{ id: string; label: string; critical: boolean }> = [
  { id: 'openid', label: 'Sign in', critical: true },
  { id: 'https://www.googleapis.com/auth/userinfo.email', label: 'Email', critical: true },
  { id: 'https://www.googleapis.com/auth/userinfo.profile', label: 'Profile', critical: true },
  { id: 'https://www.googleapis.com/auth/gmail.readonly', label: 'Gmail (read-only)', critical: false },
  { id: 'https://www.googleapis.com/auth/calendar.events', label: 'Calendar events', critical: false },
  { id: 'https://www.googleapis.com/auth/drive.file', label: `Drive (${APP_NAME} files only)`, critical: false },
]

/** Match either the short form (`email`, `profile`) or the full URL form
 * Google returns depending on the scope shape. Google sometimes stores
 * `email` alongside `https://…/userinfo.email` — treat both as granted. */
function hasScope(granted: string[], scopeId: string): boolean {
  if (granted.includes(scopeId)) return true
  if (scopeId === 'https://www.googleapis.com/auth/userinfo.email' && granted.includes('email')) return true
  if (scopeId === 'https://www.googleapis.com/auth/userinfo.profile' && granted.includes('profile')) return true
  return false
}

export function IntegrationsPanel({
  email,
  scopes,
  syncedGmailAt,
  syncedCalendarAt,
  gmailActivity = null,
  calendarActivity = null,
}: IntegrationsPanelProps) {
  const router = useRouter()
  const [syncing, startSync] = useTransition()
  const [lastGmailSync, setLastGmailSync] = useState<string | null>(syncedGmailAt)

  const gmailScope = hasScope(scopes, 'https://www.googleapis.com/auth/gmail.readonly')
  const calendarScope = hasScope(scopes, 'https://www.googleapis.com/auth/calendar.events')
  const missingBackgroundScope = !gmailScope || !calendarScope

  function reconnect(): void {
    // Sign the user out then send them straight back to the Google
    // consent screen. Passing `prompt=consent` on the provider config
    // means the second sign-in will re-collect any newly-added scopes.
    router.push('/api/auth/signout?callbackUrl=/api/auth/signin/google')
  }

  function syncNow(): void {
    startSync(async () => {
      try {
        const res = await fetch('/api/gmail/sync', { method: 'POST' })
        const json = (await res.json().catch(() => ({}))) as {
          success?: boolean
          error?: string
          checked?: number
          matched?: number
          logged?: number
        }
        if (!res.ok || !json.success) {
          toast.error(json.error ?? 'Could not sync Gmail.')
          return
        }
        const parts: string[] = []
        if (typeof json.checked === 'number') parts.push(`${json.checked} checked`)
        if (typeof json.matched === 'number') parts.push(`${json.matched} matched`)
        if (typeof json.logged === 'number') parts.push(`${json.logged} logged`)
        toast.success(parts.length ? `Gmail synced — ${parts.join(', ')}` : 'Gmail synced')
        setLastGmailSync(new Date().toISOString())
      } catch {
        toast.error('Could not reach the sync endpoint.')
      }
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Plug className="size-4 text-muted-foreground" />
          <CardTitle>Google account</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Identity row */}
        <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{email ?? 'Not signed in'}</div>
            <div className="text-xs text-muted-foreground">
              Signed in via Google · access + refresh tokens stored server-side
            </div>
          </div>
          {missingBackgroundScope ? (
            <Badge variant="warning" className="shrink-0 text-[10px]">
              <AlertTriangle className="mr-1 size-3" aria-hidden="true" /> Partial access
            </Badge>
          ) : (
            <Badge variant="success" className="shrink-0 text-[10px]">
              <CheckCircle2 className="mr-1 size-3" aria-hidden="true" /> Connected
            </Badge>
          )}
        </div>

        {/* Scope chips */}
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Scopes granted
          </div>
          <div className="flex flex-wrap gap-1.5">
            {REQUIRED_SCOPES.map((s) => {
              const granted = hasScope(scopes, s.id)
              return (
                <Badge
                  key={s.id}
                  variant={granted ? 'success' : 'outline'}
                  className={granted ? 'text-[11px]' : 'border-dashed text-[11px] text-muted-foreground'}
                >
                  {granted ? (
                    <CheckCircle2 className="mr-1 size-3" aria-hidden="true" />
                  ) : (
                    <CircleDashed className="mr-1 size-3" aria-hidden="true" />
                  )}
                  {s.label}
                  <span className="sr-only">{granted ? ' (granted)' : ' (not granted)'}</span>
                </Badge>
              )
            })}
          </div>
        </div>

        {/* Missing-scope warning */}
        {missingBackgroundScope ? (
          <div className="rounded-md border border-warning/30 bg-warning-soft p-3 text-xs text-warning">
            <p className="font-medium">Reconnect to grant email + calendar access</p>
            <p className="mt-0.5">
              Your Google connection is missing{' '}
              {!gmailScope ? <span className="font-medium">Gmail read</span> : null}
              {!gmailScope && !calendarScope ? ' and ' : null}
              {!calendarScope ? <span className="font-medium">Calendar events</span> : null}
              . Reconnect to enable inbox sync and calendar push.
            </p>
          </div>
        ) : null}

        {/* Gmail row */}
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <div className="flex min-w-0 items-start gap-2">
            <Mail className="mt-0.5 size-4 shrink-0 text-info" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-sm font-medium">Gmail sync</div>
              <div className="text-xs text-muted-foreground">
                Last synced:{' '}
                {lastGmailSync ? (
                  <LocalTime date={lastGmailSync} format="relative" />
                ) : (
                  'Never'
                )}
              </div>
              <LastActivity item={gmailActivity} logsHref="/settings/logs?category=gmail" testId="gmail-last-activity" />
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={syncNow}
            disabled={syncing || !gmailScope}
          >
            {syncing ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {syncing ? 'Syncing…' : 'Sync now'}
          </Button>
        </div>

        {/* Calendar row */}
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <div className="flex min-w-0 items-start gap-2">
            <CalendarIcon className="mt-0.5 size-4 shrink-0 text-stage-interview" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-sm font-medium">Calendar</div>
              <div className="text-xs text-muted-foreground">
                Last event pushed:{' '}
                {syncedCalendarAt ? (
                  <LocalTime date={syncedCalendarAt} format="relative" />
                ) : (
                  'Never'
                )}
                <span className="ml-1">· push-only, no manual sync</span>
              </div>
              <LastActivity item={calendarActivity} logsHref="/settings/logs?category=calendar" testId="calendar-last-activity" />
            </div>
          </div>
        </div>

        {/* Reconnect */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            Grant new scopes or re-authorize after a refresh-token failure.
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={reconnect}>
            <ExternalLink className="size-3.5" />
            Reconnect Google
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
