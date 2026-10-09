import { plural } from '@/lib/ui/labels'
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
      `Drain ran ${plural(n(c, 'claimed'), 'job')}: ${n(c, 'done')} done, ${n(c, 'failed') + n(c, 'dead')} failed (${s(c, 'stoppedBy') || 'empty'})`,
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
  // Profile imports, undo and reset (lib/import, lib/reset). Counts and the
  // import source only — never names, skills or page text.
  profile_import_applied: {
    category: 'app',
    persist: true,
    strings: ['source', 'mode'],
    message: (c) => `Profile import (${s(c, 'source') || '?'}) ${s(c, 'mode') === 'saved' ? 'saved' : 'suggested for the portfolio'}`,
  },
  import_undone: {
    category: 'app',
    persist: true,
    strings: ['source'],
    message: (c) =>
      `Undid a ${s(c, 'source') || ''} import: ${plural(n(c, 'removed'), 'item')} removed, ${n(c, 'restored')} restored${n(c, 'connections') > 0 ? `, ${plural(n(c, 'connections'), 'connection')} removed` : ''}`,
  },
  profile_reset: {
    category: 'app',
    persist: true,
    message: (c) => `Profile details reset (${plural(Object.values(c).filter((v) => typeof v === 'number').length, 'part')})`,
  },
  // Error screens (app/error.tsx and friends report here via /api/client-errors)
  client_render_error: {
    category: 'app',
    strings: ['boundary'],
    message: (c) =>
      `A page failed to load${s(c, 'route') ? ` (${s(c, 'route')})` : ''}${s(c, 'code') ? `, error code ${s(c, 'code')}` : ''}${s(c, 'err') ? `: ${s(c, 'err')}` : ''}`,
  },
  // Cron
  cron_schedule: {
    category: 'cron',
    persist: true,
    strings: ['day'],
    message: (c) => `Scheduled ${plural(n(c, 'enqueued'), 'job')} for ${plural(n(c, 'users'), 'user')}`,
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
  // Company discovery (lib/company-discovery). Counts and source ids only.
  company_discovery_run: {
    category: 'source',
    persist: true,
    message: (c) =>
      `Company discovery: ${n(c, 'fetched')} found · ${n(c, 'new')} new · ${n(c, 'updated')} updated${n(c, 'failed') > 0 ? ` · ${plural(n(c, 'failed'), 'source')} failed` : ''}`,
  },
  company_discovery_source_failed: {
    category: 'source',
    strings: ['source'],
    message: (c) => `Company discovery source ${s(c, 'source') || '?'} failed: ${s(c, 'err')}`,
  },
  company_enrich_done: {
    category: 'source',
    persist: true,
    message: (c) =>
      `Company enrichment: ${n(c, 'checked')} checked · ${n(c, 'careers')} careers pages · ${n(c, 'boards')} job boards · ${n(c, 'blocked')} skipped by robots.txt`,
  },
  company_careers_changed: {
    category: 'source',
    persist: true,
    message: (c) => `Careers pages changed: ${n(c, 'changed')} of ${n(c, 'checked')} watched`,
  },
  company_growth_done: {
    category: 'source',
    persist: true,
    message: (c) =>
      `Company growth: ${n(c, 'scored')} of ${n(c, 'companies')} scored · ${n(c, 'roleCounts')} role counts · ${n(c, 'github')} GitHub orgs · ${plural(n(c, 'gems'), 'hidden gem')}`,
  },
  companies_reset: {
    category: 'source',
    persist: true,
    message: (c) => `Companies reset: ${plural(n(c, 'deleted'), 'company', 'companies')} removed${c.remaining ? ' (more left: run it again)' : ''}`,
  },
  // Company reputation (lib/reputation)
  reputation_refreshed: {
    category: 'source',
    persist: true,
    message: (c) =>
      `Company reputation refreshed: ${plural(n(c, 'signals'), 'signal')}${n(c, 'failedSources') > 0 ? ` · ${plural(n(c, 'failedSources'), 'source')} failed` : ''}`,
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
      `Radar ${s(c, 'source') || 'source'}: ${n(c, 'fetched')} found, ${n(c, 'new')} new, ${n(c, 'matched')} on watch terms${n(c, 'partialErrors') > 0 ? ` · ${plural(n(c, 'partialErrors'), 'request')} failed` : ''}`,
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
    message: (c) => `Radar brief drafted from ${plural(n(c, 'sources'), 'source')}: ${plural(n(c, 'kept'), 'cited sentence')} kept, ${n(c, 'dropped')} dropped`,
  },
  radar_brief_skipped: {
    category: 'radar',
    persist: true,
    message: (c) => `Radar brief skipped: ${n(c, 'sources')} primary source(s), 2 needed`,
  },
  radar_brief_source_failed: {
    category: 'radar',
    message: (c) => `Radar brief: ${plural(n(c, 'failed'), 'source')} could not be fetched (${s(c, 'err')})`,
  },
  radar_brief_saved: {
    category: 'radar',
    persist: true,
    message: (c) => `Radar brief saved: ${plural(n(c, 'sentences'), 'sentence')} from ${plural(n(c, 'sources'), 'source')}`,
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
    message: (c) => `Radar brief added to the Playground: ${plural(n(c, 'cards'), 'card')}`,
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
    message: (c) => `Moved ${plural(n(c, 'migrated'), 'file')} to Drive, ${n(c, 'remaining')} left`,
  },
  // Usage
  usage_snapshot: { category: 'usage', persist: true, message: () => 'Usage snapshot taken' },
  usage_early_retention: { category: 'usage', persist: true, message: () => 'Early retention ran (storage high)' },
  // Portfolio → profile sync (lib/portfolio/pull.ts). Context is counts and
  // the trigger / source only: never the token, never the file content.
  portfolio_pull: {
    category: 'app',
    persist: true,
    strings: ['trigger', 'source'],
    message: (c) =>
      n(c, 'sections') > 0
        ? `Profile synced from the portfolio (${plural(n(c, 'sections'), 'section')} updated${n(c, 'orphaned') > 0 ? `, ${plural(n(c, 'orphaned'), 'item')} removed` : ''})`
        : 'Profile synced from the portfolio (no changes)',
  },
  portfolio_pull_failed: {
    category: 'app',
    strings: ['trigger'],
    message: (c) => `Portfolio sync failed (${s(c, 'trigger') || 'sync'})`,
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
      `Placement seeded ${plural(n(c, 'seeds'), 'skill')} from the profile; ${plural(n(c, 'studyTargets'), 'study target')}`,
  },
  academy_placement_completed: {
    category: 'playground',
    persist: true,
    message: (c) => `Placement check finished (${plural(n(c, 'items'), 'item')})`,
  },
  academy_plan_generated: {
    category: 'playground',
    persist: true,
    strings: ['reason'],
    message: (c) => `Daily plan ${s(c, 'reason') || 'generated'}: ${plural(n(c, 'items'), 'item')}, ${n(c, 'minutes')} min`,
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
    message: (c) => `Shortlist built: ${n(c, 'shortlisted')} of ${plural(n(c, 'candidates'), 'candidate')}`,
  },
  application_prepared: {
    category: 'app',
    persist: true,
    strings: ['applicationId'],
    message: (c) => `Application prepared: ${plural(n(c, 'done'), 'step')} done, ${n(c, 'skipped')} skipped`,
  },
  marked_applied: {
    category: 'app',
    persist: true,
    strings: ['applicationId'],
    message: (c) =>
      `Marked applied with ${plural(n(c, 'documents'), 'document')}${n(c, 'followupDays') > 0 ? `; follow-up in ${n(c, 'followupDays')} days` : ''}`,
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
