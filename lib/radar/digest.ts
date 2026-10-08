/**
 * "Radar: new on your watch terms" — which entries an update carries, and
 * which channel each notification mode uses. Pure.
 *
 *   instant  a browser notification as soon as a match is fetched
 *   daily    a section in the daily discovery email (when that email is on)
 *   weekly   a section in the Monday weekly digest (default)
 *   off      nothing is pushed; the nav badge still counts new matches
 */

export const RADAR_NOTIFY_MODES = ['instant', 'daily', 'weekly', 'off'] as const
export type RadarNotifyMode = (typeof RADAR_NOTIFY_MODES)[number]
export type RadarChannel = 'browser' | 'daily_email' | 'weekly_digest'

export const RADAR_NOTIFY_LABELS: Readonly<Record<RadarNotifyMode, string>> = {
  instant: 'Instant (browser notification)',
  daily: 'Daily (in the discovery email)',
  weekly: 'Weekly (in the Monday digest)',
  off: 'Off (badge only)',
}

const CHANNEL: Readonly<Record<RadarNotifyMode, RadarChannel | null>> = {
  instant: 'browser',
  daily: 'daily_email',
  weekly: 'weekly_digest',
  off: null,
}

export function radarNotifyMode(v: unknown): RadarNotifyMode {
  return (RADAR_NOTIFY_MODES as readonly unknown[]).includes(v) ? (v as RadarNotifyMode) : 'weekly'
}

export function channelFor(mode: RadarNotifyMode): RadarChannel | null {
  return CHANNEL[mode]
}

export interface DigestCandidate {
  id: string
  name: string
  kind: string
  sources: readonly string[]
  matchedTerms: readonly string[]
  lastSeenAt: Date
  readAt: Date | null
}

export interface DigestLine {
  id: string
  name: string
  kind: string
  /** Labels of the matching terms. */
  terms: string[]
  sources: string[]
  lastSeenAt: Date
}

export const DIGEST_MAX = 8

/**
 * Unread entries matching at least one current, unmuted term, seen since
 * `since`, newest first, at most `limit`.
 */
export function selectDigestEntries(
  candidates: readonly DigestCandidate[],
  opts: { since: Date; termLabels: ReadonlyMap<string, string>; limit?: number },
): DigestLine[] {
  return candidates
    .flatMap((c): DigestLine[] => {
      const terms = c.matchedTerms.flatMap((id) => {
        const label = opts.termLabels.get(id)
        return label ? [label] : []
      })
      if (terms.length === 0 || c.readAt !== null || c.lastSeenAt.getTime() < opts.since.getTime()) return []
      return [{ id: c.id, name: c.name, kind: c.kind, terms, sources: [...c.sources], lastSeenAt: c.lastSeenAt }]
    })
    .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime() || a.name.localeCompare(b.name))
    .slice(0, opts.limit ?? DIGEST_MAX)
}
