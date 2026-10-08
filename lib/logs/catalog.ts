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
  // "Add from text or link" (lib/discovery/manual-import). Counts only.
  manual_import_done: {
    category: 'source',
    persist: true,
    message: (c) =>
      `Added from text or link: ${n(c, 'imported')} imported · ${n(c, 'duplicates')} already in Discovery · ${n(c, 'enriched')} from an ATS`,
  },
  // Company reputation (lib/reputation)
  reputation_refreshed: {
    category: 'source',
    persist: true,
    message: (c) =>
      `Company reputation refreshed: ${n(c, 'signals')} signal(s)${n(c, 'failedSources') > 0 ? ` · ${n(c, 'failedSources')} source(s) failed` : ''}`,
  },
  reputation_source_failed: {
    category: 'source',
    strings: ['source'],
    message: (c) => `Reputation source ${s(c, 'source') || '?'} failed: ${s(c, 'err')}`,
  },
  reputation_summary_confirmed: {
    category: 'ai',
    persist: true,
    message: (c) => `Company reputation summary confirmed (${n(c, 'redFlags')} red flag(s))`,
  },
  // AI Radar (lib/radar). Context: source ids, counts and short safe error
  // text only — never watch terms, titles or brief text.
  radar_source_polled: {
    category: 'radar',
    persist: true,
    strings: ['source'],
    message: (c) =>
      `Radar ${s(c, 'source') || 'source'}: ${n(c, 'fetched')} found, ${n(c, 'new')} new, ${n(c, 'matched')} on watch terms${n(c, 'partialErrors') > 0 ? ` · ${n(c, 'partialErrors')} request(s) failed` : ''}`,
  },
  radar_source_failed: {
    category: 'radar',
    strings: ['source'],
    message: (c) => `Radar ${s(c, 'source') || 'source'} failed: ${s(c, 'err')}`,
  },
  radar_watch_changed: {
    category: 'radar',
    persist: true,
    strings: ['action'],
    message: (c) => `Watch term ${s(c, 'action') || 'changed'}`,
  },
  radar_brief_drafted: {
    category: 'radar',
    persist: true,
    message: (c) => `Radar brief drafted from ${n(c, 'sources')} source(s): ${n(c, 'kept')} cited sentence(s) kept, ${n(c, 'dropped')} dropped`,
  },
  radar_brief_skipped: {
    category: 'radar',
    persist: true,
    message: (c) => `Radar brief skipped: ${n(c, 'sources')} primary source(s), 2 needed`,
  },
  radar_brief_source_failed: {
    category: 'radar',
    message: (c) => `Radar brief: ${n(c, 'failed')} source(s) could not be fetched (${s(c, 'err')})`,
  },
  radar_brief_saved: {
    category: 'radar',
    persist: true,
    message: (c) => `Radar brief saved: ${n(c, 'sentences')} sentence(s) from ${n(c, 'sources')} source(s)`,
  },
  // What's new (lib/radar/new): shared fetch, no user context.
  radar_new_polled: {
    category: 'radar',
    persist: true,
    strings: ['source'],
    message: (c) =>
      `What's new ${s(c, 'source') || 'source'}: ${n(c, 'fetched')} found, ${n(c, 'new')} new, ${n(c, 'joined')} on another source too, ${n(c, 'variants')} variant(s) folded${n(c, 'partialErrors') > 0 ? ` · ${n(c, 'partialErrors')} request(s) failed` : ''}`,
  },
  radar_new_failed: {
    category: 'radar',
    strings: ['source'],
    message: (c) => `What's new ${s(c, 'source') || 'source'} failed: ${s(c, 'err')}`,
  },
  radar_new_profile_failed: {
    category: 'radar',
    message: (c) => `What's new: a release list could not be read (${s(c, 'err')})`,
  },
  radar_new_action: {
    category: 'radar',
    persist: true,
    strings: ['action'],
    message: (c) => `What's new: ${s(c, 'action') || 'action'}`,
  },
  radar_new_digest_failed: {
    category: 'radar',
    message: (c) => `What's new digest section skipped: ${s(c, 'err')}`,
  },
  radar_module_created: {
    category: 'playground',
    persist: true,
    message: (c) => `Radar brief added to the Playground: ${n(c, 'cards')} card(s)`,
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
  // Publish to portfolio (lib/portfolio/publish.ts). Context is numbers and
  // a version string only: never the token, never the file content.
  profile_published: {
    category: 'app',
    persist: true,
    strings: ['version'],
    message: (c) =>
      `Profile published to the portfolio (${s(c, 'version') || 'new version'}, ${n(c, 'sections')} section(s) changed)`,
  },
  profile_publish_conflict: {
    category: 'app',
    persist: true,
    message: (c) =>
      `Portfolio profile.json changed outside lee (${s(c, 'reason') || 'edited'}): ${n(c, 'sections')} section(s) differ — waiting for your choice`,
  },
  // Playground (v13 core engine). Context: skill/item ids, formats, numbers.
  // Never answers, profile text or study notes.
  academy_attempt_submitted: {
    category: 'playground',
    persist: true,
    strings: ['skillId', 'format', 'mode'],
    message: (c) =>
      `Playground attempt scored ${n(c, 'composite')} on ${s(c, 'skillId') || 'a skill'} (+${n(c, 'xp')} XP)`,
  },
  academy_level_up: {
    category: 'playground',
    persist: true,
    strings: ['skillId'],
    message: (c) => `Level up: ${s(c, 'skillId') || 'a skill'} reached level ${n(c, 'level')}`,
  },
  academy_placement_seeded: {
    category: 'playground',
    persist: true,
    message: (c) =>
      `Placement seeded ${n(c, 'seeds')} skill(s) from the profile; ${n(c, 'studyTargets')} study target(s)`,
  },
  academy_placement_completed: {
    category: 'playground',
    persist: true,
    message: (c) => `Placement check finished (${n(c, 'items')} item(s))`,
  },
  academy_plan_generated: {
    category: 'playground',
    persist: true,
    strings: ['reason'],
    message: (c) => `Daily plan ${s(c, 'reason') || 'generated'}: ${n(c, 'items')} item(s), ${n(c, 'minutes')} min`,
  },
  academy_achievement_earned: {
    category: 'playground',
    persist: true,
    strings: ['achievementId'],
    message: (c) => `Achievement earned: ${s(c, 'achievementId')}`,
  },
  // Apply faster (lib/apply). Context: ids and counts only — never titles,
  // company names, CV or letter text.
  shortlist_built: {
    category: 'job',
    persist: true,
    message: (c) => `Shortlist built: ${n(c, 'shortlisted')} of ${n(c, 'candidates')} candidate(s)`,
  },
  application_prepared: {
    category: 'app',
    persist: true,
    strings: ['applicationId'],
    message: (c) => `Application prepared: ${n(c, 'done')} step(s) done, ${n(c, 'skipped')} skipped`,
  },
  marked_applied: {
    category: 'app',
    persist: true,
    strings: ['applicationId'],
    message: (c) =>
      `Marked applied with ${n(c, 'documents')} document(s)${n(c, 'followupDays') > 0 ? `; follow-up in ${n(c, 'followupDays')} days` : ''}`,
  },
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
  [/^academy_|playground/, 'playground'],
  [/^radar_/, 'radar'],
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
