'use client'
import { useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { Bell, BellOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { APP_NAME } from '@/lib/brand'
import {
  permissionState,
  permissionStateServerSnapshot,
  requestPermission,
  showNotification,
  subscribePermissionState,
  type NotificationPermissionState,
} from '@/lib/notifications/browser'

/**
 * Card for /settings/notifications that requests browser Notification
 * permission and offers a "Test" button to fire a sample notification.
 * Renders a support hint when the API is unavailable.
 */
export function BrowserNotificationsToggle() {
  const state = useSyncExternalStore<NotificationPermissionState>(
    subscribePermissionState,
    permissionState,
    permissionStateServerSnapshot,
  )
  const [busy, setBusy] = useState(false)

  async function enable(): Promise<void> {
    setBusy(true)
    try {
      const next = await requestPermission()
      if (next === 'granted') {
        toast.success('Browser notifications enabled')
      } else if (next === 'denied') {
        toast.error(
          'Notifications blocked in browser settings. Update site permissions to re-enable.',
        )
      }
    } finally {
      setBusy(false)
    }
  }

  function fireTest(): void {
    const n = showNotification({
      title: APP_NAME,
      body: 'Notifications are working — you\'ll be pinged when todos come due.',
      tag: 'employ-test',
    })
    if (!n) toast.error('Could not fire test notification.')
  }

  // Derive from the store only: calling isSupported() during render is
  // false on the server and true in the browser, which broke hydration.
  const unsupported = state === 'unsupported'

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Browser notifications</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Get a browser notification when a todo crosses its due time. Polling
          runs every 5 minutes on any page you have open.
        </p>

        {unsupported ? (
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft p-3 text-xs text-warning">
            <BellOff className="mt-0.5 size-4 shrink-0" />
            <div>
              This browser does not support the Notifications API. Try a
              recent Chrome, Firefox, or Edge build.
            </div>
          </div>
        ) : null}

        {!unsupported ? (
          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">
                Status: <StatusChip state={state} />
              </div>
              <div className="text-xs text-muted-foreground">
                {state === 'granted'
                  ? 'You will be notified when todos are due.'
                  : state === 'denied'
                    ? 'Blocked in browser settings — flip site permissions to re-enable.'
                    : 'Permission has not been requested yet.'}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={state !== 'granted'}
                onClick={fireTest}
              >
                Test
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy || state === 'denied' || state === 'granted'}
                onClick={() => {
                  void enable()
                }}
              >
                {state === 'granted' ? 'Enabled' : 'Enable'}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function StatusChip({ state }: { state: NotificationPermissionState }) {
  const map: Record<NotificationPermissionState, { label: string; className: string }> = {
    granted: {
      label: 'Enabled',
      className:
        'bg-success-soft text-success',
    },
    denied: {
      label: 'Blocked',
      className: 'bg-danger-soft text-danger',
    },
    default: {
      label: 'Not requested',
      className: 'bg-neutral-soft text-neutral',
    },
    unsupported: {
      label: 'Unsupported',
      className: 'bg-neutral-soft text-neutral',
    },
  }
  const info = map[state]
  return (
    <span
      className={`ml-1 inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${info.className}`}
    >
      {info.label}
    </span>
  )
}
