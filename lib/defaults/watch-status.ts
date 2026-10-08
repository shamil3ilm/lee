import { DEFAULT_SOURCES, sourceIdentity } from './catalog'
import { WATCH_EMPLOYERS, type WatchEmployer, type WatchMethod } from './watch-employers'

/**
 * Settings › Sources › "GCC employer watch list": one row per employer
 * with how lee watches it and where that stands. Pure (the page passes the
 * user's sources and when each last produced an opening); client-safe.
 *
 * State lives in the existing `sources` rows: an adapter employer is its
 * source's `enabled`; a watch link keeps `config.watching` (default on) and
 * `config.lastCheckedAt` (the user's "Checked" click) — no extra column.
 */

/** "Check weekly": a watch link unchecked for this long is due. */
export const CHECK_EVERY_DAYS = 7
const DAY_MS = 86_400_000

export interface WatchSourceLike {
  id: string
  kind: string
  enabled: boolean
  config: unknown
  lastPolledAt: Date | null
  lastError: string | null
}

export type WatchStatus = 'polling' | 'waiting' | 'error' | 'off' | 'check_due' | 'checked' | 'not_added'

export interface EmployerWatchRow {
  key: string
  name: string
  country: string
  sector: string
  backend: string
  methods: readonly WatchMethod[]
  careersUrl: string
  alertSignupUrl: string | null
  note: string
  sourceId: string | null
  /** Adapter employers poll; others are links checked by hand. */
  polled: boolean
  watching: boolean
  status: WatchStatus
  /** ISO: newest discovery from the employer's source (adapter) or the last "Checked" click. */
  lastSeenAt: string | null
  lastCheckedAt: string | null
}

function configOf(s: WatchSourceLike): Record<string, unknown> {
  return s.config && typeof s.config === 'object' && !Array.isArray(s.config) ? (s.config as Record<string, unknown>) : {}
}

const identityByKey = new Map(DEFAULT_SOURCES.map((d) => [d.key, sourceIdentity(d.kind, d.config)] as const))

function statusOf(e: WatchEmployer, s: WatchSourceLike | undefined, watching: boolean, checkedAt: Date | null, now: Date): WatchStatus {
  if (!s) return 'not_added'
  if (!watching) return 'off'
  if (s.kind !== 'watch') {
    if (s.lastError) return 'error'
    return s.lastPolledAt ? 'polling' : 'waiting'
  }
  if (!checkedAt || now.getTime() - checkedAt.getTime() > CHECK_EVERY_DAYS * DAY_MS) return 'check_due'
  return 'checked'
}

function validDate(v: unknown): Date | null {
  if (typeof v !== 'string') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export function employerWatchRows(
  sources: readonly WatchSourceLike[],
  lastSeen: ReadonlyMap<string, Date>,
  now: Date = new Date(),
  employers: readonly WatchEmployer[] = WATCH_EMPLOYERS,
): EmployerWatchRow[] {
  const byIdentity = new Map(sources.map((s) => [sourceIdentity(s.kind, configOf(s)), s] as const))
  return employers.map((e) => {
    const identity = identityByKey.get(e.sourceKey)
    const s = identity ? byIdentity.get(identity) : undefined
    const config = s ? configOf(s) : {}
    const polled = s ? s.kind !== 'watch' : e.methods.includes('adapter')
    const watching = s ? (polled ? s.enabled : config.watching !== false) : false
    const checkedAt = validDate(config.lastCheckedAt)
    const seen = s ? (polled ? lastSeen.get(s.id) ?? null : checkedAt) : null
    return {
      key: e.key,
      name: e.name,
      country: e.country,
      sector: e.sector,
      backend: e.backend,
      methods: e.methods,
      careersUrl: e.careersUrl,
      alertSignupUrl: e.alertSignupUrl ?? null,
      note: e.note,
      sourceId: s?.id ?? null,
      polled,
      watching,
      status: statusOf(e, s, watching, checkedAt, now),
      lastSeenAt: seen ? seen.toISOString() : null,
      lastCheckedAt: checkedAt ? checkedAt.toISOString() : null,
    }
  })
}

/** Watch-link config after a toggle or a "Checked" click (never mutates). */
export function nextWatchConfig(
  config: unknown,
  change: { watching?: boolean; checkedAt?: Date },
): Record<string, unknown> {
  const base = config && typeof config === 'object' && !Array.isArray(config) ? (config as Record<string, unknown>) : {}
  return {
    ...base,
    ...(change.watching !== undefined ? { watching: change.watching } : {}),
    ...(change.checkedAt ? { lastCheckedAt: change.checkedAt.toISOString() } : {}),
  }
}
