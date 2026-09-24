'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Loader2, Mail, Send } from 'lucide-react'
import { toggleDigestAction } from '@/app/(authed)/settings/notifications/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { relativeFromNow } from '@/lib/ui/date'

interface NotificationsPanelProps {
  weeklyDigestEnabled: boolean
  lastSentAt: string | null
  hasGmailSendScope: boolean
}

export function NotificationsPanel({
  weeklyDigestEnabled,
  lastSentAt,
  hasGmailSendScope,
}: NotificationsPanelProps) {
  const [enabled, setEnabled] = useState(weeklyDigestEnabled)
  const [saving, startSave] = useTransition()
  const [sending, setSending] = useState(false)
  const [lastSent, setLastSent] = useState<string | null>(lastSentAt)

  function toggle(next: boolean): void {
    // Optimistic — snap the switch immediately, revert on failure.
    const previous = enabled
    setEnabled(next)
    startSave(async () => {
      const result = await toggleDigestAction(next)
      if ('error' in result) {
        setEnabled(previous)
        toast.error(result.error)
      } else {
        toast.success(next ? 'Weekly digest enabled' : 'Weekly digest paused')
      }
    })
  }

  async function sendTest(): Promise<void> {
    setSending(true)
    try {
      const res = await fetch('/api/digest/send-now', { method: 'POST' })
      const json = (await res.json().catch(() => ({}))) as {
        messageId?: string
        apps?: number
        interviews?: number
        error?: string
      }
      if (res.ok && json.messageId) {
        toast.success(
          `Digest sent — ${json.apps ?? 0} apps, ${json.interviews ?? 0} interviews.`,
        )
        setLastSent(new Date().toISOString())
      } else {
        toast.error(json.error ?? 'Could not send digest.')
      }
    } catch {
      toast.error('Network error — could not send digest.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Mail className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Weekly digest</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasGmailSendScope ? (
          <div className="flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-900 dark:border-yellow-900/50 dark:bg-yellow-950/40 dark:text-yellow-200">
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
            <div className="text-sm font-medium">Send the weekly digest</div>
            <div className="text-xs text-muted-foreground">
              Delivered Mondays at 08:00 UTC from your own Gmail account.
            </div>
          </div>
          {/* Native checkbox styled as a toggle — avoids adding a shadcn Switch
              primitive just for one control. Keyboard + screen-reader friendly. */}
          <label className="relative inline-flex shrink-0 cursor-pointer items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={enabled}
              disabled={saving}
              onChange={(e) => toggle(e.currentTarget.checked)}
              aria-label="Enable weekly digest"
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

        <div className="text-xs text-muted-foreground">
          Last sent:{' '}
          {lastSent ? (
            <span title={new Date(lastSent).toLocaleString()}>
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
            disabled={sending || !hasGmailSendScope}
          >
            {sending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
            {sending ? 'Sending…' : 'Send test digest now'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
