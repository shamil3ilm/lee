'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Bell, Loader2, Send } from 'lucide-react'
import {
  setDiscoveryMinScoreAction,
  toggleDiscoveryBrowserAction,
  toggleDiscoveryEmailAction,
} from '@/app/(authed)/settings/notifications/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DISPLAY_LOCALE, relativeFromNow } from '@/lib/ui/date'

interface DiscoveryNotificationsPanelProps {
  emailEnabled: boolean
  browserEnabled: boolean
  minScore: number
  lastSentAt: string | null
  hasGmailSendScope: boolean
}

const MIN_SCORE = 0
const MAX_SCORE = 100

/**
 * Settings card for v6.2 per-cycle discovery notifications. Sits alongside
 * the weekly-digest card in /settings/notifications. Every toggle is
 * optimistic (snap → revert on failure) — server actions are cheap and the
 * feedback delay would otherwise be jarring on a slow connection.
 */
export function DiscoveryNotificationsPanel({
  emailEnabled: initialEmailEnabled,
  browserEnabled: initialBrowserEnabled,
  minScore: initialMinScore,
  lastSentAt,
  hasGmailSendScope,
}: DiscoveryNotificationsPanelProps) {
  const [emailEnabled, setEmailEnabled] = useState(initialEmailEnabled)
  const [browserEnabled, setBrowserEnabled] = useState(initialBrowserEnabled)
  const [minScore, setMinScore] = useState(initialMinScore)
  const [savingEmail, startSaveEmail] = useTransition()
  const [savingBrowser, startSaveBrowser] = useTransition()
  const [savingScore, startSaveScore] = useTransition()
  const [testing, setTesting] = useState(false)
  const [lastSent, setLastSent] = useState<string | null>(lastSentAt)

  function toggleEmail(next: boolean): void {
    const previous = emailEnabled
    setEmailEnabled(next)
    startSaveEmail(async () => {
      const result = await toggleDiscoveryEmailAction(next)
      if ('error' in result) {
        setEmailEnabled(previous)
        toast.error(result.error)
      } else {
        toast.success(next ? 'Discovery email enabled' : 'Discovery email paused')
      }
    })
  }

  function toggleBrowser(next: boolean): void {
    const previous = browserEnabled
    setBrowserEnabled(next)
    startSaveBrowser(async () => {
      const result = await toggleDiscoveryBrowserAction(next)
      if ('error' in result) {
        setBrowserEnabled(previous)
        toast.error(result.error)
      } else {
        toast.success(
          next ? 'Browser notifications enabled' : 'Browser notifications paused',
        )
      }
    })
  }

  function commitMinScore(next: number): void {
    const previous = minScore
    setMinScore(next)
    startSaveScore(async () => {
      const result = await setDiscoveryMinScoreAction(next)
      if ('error' in result) {
        setMinScore(previous)
        toast.error(result.error)
      }
    })
  }

  async function sendTest(): Promise<void> {
    setTesting(true)
    try {
      const res = await fetch('/api/notifications/discovery/test', {
        method: 'POST',
      })
      const json = (await res.json().catch(() => ({}))) as {
        sent?: boolean
        count?: number
        reason?: string
        error?: string
      }
      if (res.ok) {
        if (json.sent) {
          toast.success(
            `Sent test email — ${json.count ?? 0} match${(json.count ?? 0) === 1 ? '' : 'es'}.`,
          )
          setLastSent(new Date().toISOString())
        } else if (json.reason === 'no_matches') {
          toast.info(
            'No matches in the last 7 days — lower your threshold or wait for the next discovery cycle.',
          )
        } else {
          toast.info('Nothing to send.')
        }
      } else {
        toast.error(json.error ?? 'Could not send test email.')
      }
    } catch {
      toast.error('Network error — could not send test email.')
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">
            Discovery notifications
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Get notified when a fresh discovery clears your match threshold.
          Runs after every discovery cycle (roughly daily) — independent of
          the Monday-only weekly digest.
        </p>

        {!hasGmailSendScope && emailEnabled ? (
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft p-3 text-xs text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">Missing Gmail send permission</p>
              <p className="mt-0.5 opacity-90">
                Reconnect Google at{' '}
                <a
                  href="/settings/integrations"
                  className="underline underline-offset-2 hover:opacity-100"
                >
                  Settings → Integrations
                </a>{' '}
                to grant send permission.
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-4 rounded-md border p-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Email me new matches</div>
            <div className="text-xs text-muted-foreground">
              Compact summary from your own Gmail after each discovery cycle.
            </div>
          </div>
          <label className="relative inline-flex shrink-0 cursor-pointer items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={emailEnabled}
              disabled={savingEmail}
              onChange={(e) => toggleEmail(e.currentTarget.checked)}
              aria-label="Enable discovery email"
            />
            <span
              className="h-5 w-9 rounded-full bg-input transition-colors peer-checked:bg-primary peer-disabled:opacity-50"
              aria-hidden="true"
            />
            <span
              className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform peer-checked:translate-x-4"
              aria-hidden="true"
            />
          </label>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-md border p-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Browser notifications</div>
            <div className="text-xs text-muted-foreground">
              Ping any open tab when a new match comes in. Requires browser
              notification permission (grant below).
            </div>
          </div>
          <label className="relative inline-flex shrink-0 cursor-pointer items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={browserEnabled}
              disabled={savingBrowser}
              onChange={(e) => toggleBrowser(e.currentTarget.checked)}
              aria-label="Enable discovery browser notifications"
            />
            <span
              className="h-5 w-9 rounded-full bg-input transition-colors peer-checked:bg-primary peer-disabled:opacity-50"
              aria-hidden="true"
            />
            <span
              className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform peer-checked:translate-x-4"
              aria-hidden="true"
            />
          </label>
        </div>

        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-medium">Minimum match score</div>
              <div className="text-xs text-muted-foreground">
                Only discoveries at or above this score trigger a notification.
              </div>
            </div>
            <div className="shrink-0 text-sm font-semibold tabular-nums">
              {minScore}
            </div>
          </div>
          <input
            type="range"
            min={MIN_SCORE}
            max={MAX_SCORE}
            step={5}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.currentTarget.value))}
            onMouseUp={(e) => commitMinScore(Number(e.currentTarget.value))}
            onTouchEnd={(e) => commitMinScore(Number(e.currentTarget.value))}
            onKeyUp={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                commitMinScore(Number(e.currentTarget.value))
              }
            }}
            disabled={savingScore}
            className="w-full accent-primary"
            aria-label="Minimum match score"
          />
        </div>

        <div className="text-xs text-muted-foreground">
          Last email sent:{' '}
          {lastSent ? (
            <span title={new Date(lastSent).toLocaleString(DISPLAY_LOCALE)} suppressHydrationWarning>
              {relativeFromNow(lastSent)}
            </span>
          ) : (
            'Never'
          )}
        </div>

        <div className="flex items-center justify-end border-t pt-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              void sendTest()
            }}
            disabled={testing || !hasGmailSendScope}
          >
            {testing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
            {testing ? 'Sending…' : 'Send test email now'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
