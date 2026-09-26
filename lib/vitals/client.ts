import { isVitalMetric } from './metrics'
import { toRoutePattern } from './route-pattern'
import {
  CONNECTION_TYPES,
  NAVIGATION_TYPES,
  type BeaconMetric,
  type ConnectionType,
  type DeviceClass,
  type NavigationType,
  type VitalsBeacon,
} from './beacon-fields'

/**
 * Browser half of the vitals pipeline: batches the metrics Next's
 * useReportWebVitals reports for one page load and sends them to
 * /api/vitals with navigator.sendBeacon. Pure helpers are exported for tests;
 * createVitalsQueue holds the per-tab state.
 */

export const VITALS_ENDPOINT = '/api/vitals'
/** Client-side cap; the API enforces its own per-user limit too. */
export const MAX_BEACONS_PER_MINUTE = 10
const FLUSH_DELAY_MS = 5_000

export function deviceClass(width: number, coarsePointer: boolean): DeviceClass {
  if (width < 768) return 'mobile'
  if (width < 1024 && coarsePointer) return 'tablet'
  return 'desktop'
}

export function connectionType(effectiveType: string | undefined): ConnectionType {
  return (CONNECTION_TYPES as readonly string[]).includes(effectiveType ?? '')
    ? (effectiveType as ConnectionType)
    : 'unknown'
}

export function navigationType(raw: string | undefined): NavigationType {
  const normalized = raw === 'back_forward' ? 'back-forward' : raw
  return (NAVIGATION_TYPES as readonly string[]).includes(normalized ?? '')
    ? (normalized as NavigationType)
    : 'navigate'
}

export interface ReportedMetric {
  id: string
  name: string
  value: number
  navigationType?: string
}

export interface PageContext {
  pathname: string
  width: number
  coarsePointer: boolean
  effectiveType?: string
}

export interface VitalsQueue {
  add: (metric: ReportedMetric) => void
  flush: () => void
}

interface QueueDeps {
  context: () => PageContext
  send: (body: string) => void
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export function createVitalsQueue(deps: QueueDeps): VitalsQueue {
  const now = deps.now ?? Date.now
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const seenIds = new Set<string>()
  let pending: BeaconMetric[] = []
  let meta: Omit<VitalsBeacon, 'metrics'> | null = null
  let sentAt: number[] = []
  let timer: unknown = null

  function flush(): void {
    if (timer !== null) clearTimer(timer)
    timer = null
    if (pending.length === 0 || !meta) return
    const t = now()
    sentAt = sentAt.filter((s) => t - s < 60_000)
    if (sentAt.length >= MAX_BEACONS_PER_MINUTE) {
      pending = []
      return
    }
    sentAt = [...sentAt, t]
    const body: VitalsBeacon = { ...meta, metrics: pending.slice(0, 10) }
    pending = []
    deps.send(JSON.stringify(body))
  }

  function add(metric: ReportedMetric): void {
    // A metric id is final once sent (CLS/INP can re-report on later hides).
    if (!isVitalMetric(metric.name) || seenIds.has(metric.id)) return
    if (!Number.isFinite(metric.value) || metric.value < 0) return
    seenIds.add(metric.id)
    if (!meta) {
      const ctx = deps.context()
      meta = {
        route: toRoutePattern(ctx.pathname),
        navigationType: navigationType(metric.navigationType),
        device: deviceClass(ctx.width, ctx.coarsePointer),
        connection: connectionType(ctx.effectiveType),
      }
    }
    pending = [...pending, { name: metric.name, value: metric.value }]
    if (timer === null) timer = setTimer(flush, FLUSH_DELAY_MS)
  }

  return { add, flush }
}

/** The document's own URL path (the hard load the metrics describe). */
function loadedPathname(): string {
  const nav = performance.getEntriesByType('navigation')[0]
  try {
    return nav ? new URL(nav.name).pathname : location.pathname
  } catch {
    return location.pathname
  }
}

export function browserPageContext(): PageContext {
  const conn = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection
  return {
    pathname: loadedPathname(),
    width: window.innerWidth,
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    effectiveType: conn?.effectiveType,
  }
}

export function sendBeaconBody(body: string): void {
  const blob = new Blob([body], { type: 'application/json' })
  if (navigator.sendBeacon?.(VITALS_ENDPOINT, blob)) return
  void fetch(VITALS_ENDPOINT, {
    method: 'POST',
    body,
    keepalive: true,
    headers: { 'content-type': 'application/json' },
  }).catch(() => {
    // Best effort: a lost beacon only drops one sample.
  })
}
