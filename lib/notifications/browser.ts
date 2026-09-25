/**
 * Thin wrapper around the Web Notifications API. Kept in one place so
 * components import a stable typed surface instead of touching the raw
 * global; also makes it trivial to mock in tests.
 *
 * All functions return safe defaults on unsupported environments (SSR,
 * older browsers) — no throws so callers can call them unconditionally.
 */

export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

export function isSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function permissionState(): NotificationPermissionState {
  if (!isSupported()) return 'unsupported'
  return window.Notification.permission as NotificationPermissionState
}

/**
 * Prompt the user for permission. No-op when already granted/denied — the
 * browser caches the choice per origin. Returns the resulting state.
 */
export async function requestPermission(): Promise<NotificationPermissionState> {
  if (!isSupported()) return 'unsupported'
  if (window.Notification.permission !== 'default') {
    return window.Notification.permission as NotificationPermissionState
  }
  const result = await window.Notification.requestPermission()
  return result as NotificationPermissionState
}

export interface ShowNotificationArgs {
  title: string
  body?: string
  /** URL the notification should open on click. Same-origin only. */
  url?: string
  /**
   * Optional tag — a subsequent notification with the same tag REPLACES the
   * previous one instead of stacking. Used by the scheduler to dedupe by
   * todo id when polling ticks fire close together.
   */
  tag?: string
}

/**
 * Fire a notification. Silently returns null when permission is not granted
 * or the API is unavailable so callers don't need to gate the call site.
 */
export function showNotification(args: ShowNotificationArgs): Notification | null {
  if (!isSupported()) return null
  if (window.Notification.permission !== 'granted') return null
  const n = new window.Notification(args.title, {
    body: args.body,
    tag: args.tag,
  })
  if (args.url) {
    n.onclick = () => {
      // Focus the window if already open, otherwise navigate.
      window.focus()
      window.location.assign(args.url as string)
      n.close()
    }
  }
  return n
}
