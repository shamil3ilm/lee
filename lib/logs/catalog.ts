import { MAX_MESSAGE_LENGTH, redactText } from './redact'
import type { EventCategory, EventLevel } from './types'

/**
 * Which logger events are persisted to system_events, under which category,
 * with which context strings and message.
 *
 * - warn / error: always persisted (the category is inferred from the name
 *   unless listed here);
 * - info: persisted ONLY when listed here with `persist: true` — run events
 *   (drains, cron runs, source polls, syncs, digests, snapshots, compiles);
 * - debug: never.
 *
 * Context numbers and booleans are always kept; strings only under
 * DEFAULT_STRING_KEYS or the event's own `strings` (lib/logs/redact.ts).
 */

interface EventSpec {
  category: EventCategory
  /** Persist at info level. */
  persist?: boolean
  /** Extra context keys whose string values may be stored (redacted). */
  strings?: readonly string[]
  message?: (ctx: Readonly<Record<string, unknown>>) => string
}

/** Technical, non-personal string keys any persisted event may keep. */
export const DEFAULT_STRING_KEYS: readonly string[] = [
  'err',
  'error',
  'what',
  'code',
  'status',
  'reason',
  'reasons',
  'type',
  'label',
  'kind',
  'provider',
  'model',
  'meter',
  'stoppedBy',
  'route',
  'method',
]

function n(ctx: Readonly<Record<string, unknown>>, key: string): number {
  const v = ctx[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function s(ctx: Readonly<Record<string, unknown>>, key: string): string {
  const v = ctx[key]
  return typeof v === 'string' ? v : ''
}

export const EVENT_CATALOG: Readonly<Record<string, EventSpec>> = {
  // Queue
  queue_drain: {
    category: 'job',
    persist: true,
    message: (c) =>
      `Drain ran ${n(c, 'claimed')} job(s): ${n(c, 'done')} done, ${n(c, 'failed') + n(c, 'dead')} failed (${s(c, 'stoppedBy') || 'empty'})`,
  },
  queue_job_done: {
    category: 'job',
    persist: true,
    strings: ['summary', 'jobLabel'],
    message: (c) => `${s(c, 'jobLabel') || 'Job'} done${s(c, 'summary') ? `: ${s(c, 'summary')}` : ''}`,
  },
  queue_job_failed: {
    category: 'job',
    strings: ['jobLabel'],
    message: (c) => `${s(c, 'jobLabel') || 'Job'} failed (attempt ${n(c, 'attempt')}): ${s(c, 'err')}`,
  },
  source_first_poll_queued: { category: 'source', persist: true, strings: ['source'], message: () => 'First poll queued' },
  // Cron
  cron_schedule: {
    category: 'cron',
    persist: true,
    strings: ['day'],
    message: (c) => `Scheduled ${n(c, 'enqueued')} job(s) for ${n(c, 'users')} user(s)`,
  },
  cron_retention: { category: 'cron', persist: true, message: () => 'Retention ran' },
  cron_reminders: {
    category: 'cron',
    persist: true,
    message: (c) => `Reminders: ${n(c, 'reminders_added')} added`,
  },
  cron_discover: { category: 'cron', persist: true, message: () => 'Discovery cycle ran' },
  cron_discover_paused_by_usage: { category: 'cron', persist: true, message: () => 'Discovery paused by the usage throttle' },
  cron_sync_all: { category: 'cron', persist: true, message: () => 'Sync-all ran' },
  // Sources
  source_polled: {
    category: 'source',
    persist: true,
    strings: ['source'],
    message: (c) =>
      `${s(c, 'source') || 'Source'} polled: ${n(c, 'fetched')} found · ${n(c, 'new')} new · ${n(c, 'quarantined')} quarantined`,
  },
  source_poll_failed: {
    category: 'source',
    strings: ['source'],
    message: (c) => `${s(c, 'source') || 'Source'} poll failed: ${s(c, 'err')}`,
  },
  // Gmail / digest / notifications
  gmail_sync_done: {
    category: 'gmail',
    persist: true,
    message: (c) => `Gmail synced: ${n(c, 'checked')} checked · ${n(c, 'matched')} matched`,
  },
  weekly_digest_sent: { category: 'gmail', persist: true, message: () => 'Weekly digest sent' },
  discovery_email_sent: {
    category: 'gmail',
    persist: true,
    message: (c) => `Discovery email sent (${n(c, 'count')} matches)`,
  },
  // Calendar / Drive
  calendar_event_pushed: { category: 'calendar', persist: true, strings: ['stageId'], message: () => 'Interview pushed to Google Calendar' },
  calendar_event_updated: { category: 'calendar', persist: true, strings: ['stageId'], message: () => 'Calendar event updated' },
  calendar_event_removed: { category: 'calendar', persist: true, strings: ['stageId'], message: () => 'Calendar event removed' },
  drive_migrate_done: {
    category: 'drive',
    persist: true,
    message: (c) => `Moved ${n(c, 'migrated')} file(s) to Drive, ${n(c, 'remaining')} left`,
  },
  // Usage
  usage_snapshot: { category: 'usage', persist: true, message: () => 'Usage snapshot taken' },
  usage_early_retention: { category: 'usage', persist: true, message: () => 'Early retention ran (storage high)' },
  // LaTeX
  latex_compile: {
    category: 'latex',
    persist: true,
    strings: ['documentId'],
    message: (c) =>
      c.ok === true
        ? `Compiled${c.cached === true ? ' (cached)' : ''} in ${n(c, 'durationMs')} ms`
        : `Compile failed (status ${n(c, 'status')})`,
  },
}

/** `addSource failed` → `add_source_failed`; `scam.assess_failed` → `scam_assess_failed`. */
export function toEventName(raw: string): string {
  const name = raw
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
  return name || 'event'
}

const CATEGORY_RULES: ReadonlyArray<readonly [RegExp, EventCategory]> = [
  [/^cron_/, 'cron'],
  [/^queue_|^retry_job|^run_jobs|_job_failed$/, 'job'],
  [/gmail|digest/, 'gmail'],
  [/calendar/, 'calendar'],
  [/drive/, 'drive'],
  [/latex|compile/, 'latex'],
  [/usage|throttle/, 'usage'],
  [/auth|sign_?in|test_login|session/, 'auth'],
  [
    /^ai_|_ai_|^lab_|arena|generate|cv_score|cv_requirement|voice|decision|outreach|prep_pack|cover_letter|debrief|rate_ai/,
    'ai',
  ],
  [/source|discover|poll|scam|allow_list|watchlist/, 'source'],
]

export function categoryFor(event: string): EventCategory {
  const spec = EVENT_CATALOG[event]
  if (spec) return spec.category
  for (const [re, category] of CATEGORY_RULES) if (re.test(event)) return category
  return 'app'
}

/** Whether a logger call at `level` is persisted. */
export function shouldPersist(level: string, event: string): level is EventLevel {
  if (level === 'warn' || level === 'error') return true
  if (level === 'info') return EVENT_CATALOG[event]?.persist === true
  return false
}

const STRING_KEY_CACHE = new Map<string, ReadonlySet<string>>()

export function stringKeysFor(event: string): ReadonlySet<string> {
  const cached = STRING_KEY_CACHE.get(event)
  if (cached) return cached
  const keys = new Set([...DEFAULT_STRING_KEYS, ...(EVENT_CATALOG[event]?.strings ?? [])])
  STRING_KEY_CACHE.set(event, keys)
  return keys
}

function humanize(event: string): string {
  const text = event.replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Short human text for the event (from already-sanitized context). */
export function messageFor(event: string, ctx: Readonly<Record<string, unknown>>): string {
  const spec = EVENT_CATALOG[event]
  let text: string
  try {
    text = spec?.message ? spec.message(ctx) : ''
  } catch {
    text = ''
  }
  if (!text) {
    const err = s(ctx, 'err') || s(ctx, 'error')
    text = err ? `${humanize(event)}: ${err}` : humanize(event)
  }
  return redactText(text, MAX_MESSAGE_LENGTH)
}
