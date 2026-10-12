import { getSourceKind } from '@/lib/discovery/source-kinds'

/**
 * Can lee poll a source for this user right now? Pure and client-safe: the
 * page passes the user's setup (Gmail access, an Adzuna key) and the bulk
 * "Turn on" excludes sources that would only fail or read nothing, showing
 * the reason instead.
 */

export interface SourceSetup {
  /** Gmail read access (owner-only in the beta, lib/google/scopes.ts). */
  gmailRead: boolean
  /** An Adzuna key in Settings › AI › Service keys (or the owner's env key). */
  adzunaKey: boolean
}

/** Kinds that only read the user's Gmail. */
const GMAIL_KINDS = new Set(['email_alert', 'linkedin_post'])
/** Kinds lee never polls (filled another way). */
const NEVER_POLLED = new Set(['watch', 'manual_import', 'local_companies'])

export const BLOCKER = {
  unknownKind: "lee doesn't read this kind of source any more",
  neverPolled: "Never checked: it's filled another way",
  gmail: 'Needs Gmail access (Connect Gmail in Settings › Integrations)',
  googleAlerts: 'Needs Gmail access or the Google Alerts RSS feed',
  adzuna: 'Needs an Adzuna key (Settings › AI › Service keys)',
} as const

function configOf(config: unknown): Record<string, unknown> {
  return config && typeof config === 'object' && !Array.isArray(config) ? (config as Record<string, unknown>) : {}
}

/** Why the source can't be polled for this user, or null when it can. */
export function sourceBlocker(kind: string, config: unknown, setup: SourceSetup): string | null {
  if (NEVER_POLLED.has(kind)) return BLOCKER.neverPolled
  if (!getSourceKind(kind)) return BLOCKER.unknownKind
  if (GMAIL_KINDS.has(kind) && !setup.gmailRead) return BLOCKER.gmail
  if (kind === 'google_alerts' && !setup.gmailRead && typeof configOf(config).rssUrl !== 'string') return BLOCKER.googleAlerts
  if (kind === 'adzuna' && !setup.adzunaKey) return BLOCKER.adzuna
  return null
}
