import { describeRadarSummary, type RadarRunSummary } from '@/lib/radar/summary'
import { describeWhatsNewSummary, type WhatsNewRunSummary } from '@/lib/radar/new/summary'

/**
 * Typed run summaries: what one background job did, stored on its
 * queue_jobs row (`result.summary`) and shown in Settings › Background jobs.
 * Counts and short labels only — never content, addresses or ids beyond a
 * source name. Pure (no server imports) so client components can format it.
 */

export type DiscoverySourceSummary = {
  kind: 'discovery-source'
  /** The source's display name (the owner's own label). */
  source: string
  status: 'polled' | 'failed' | 'skipped' | 'paused'
  fetched: number
  new: number
  scored: number
  quarantined: number
  /** Items the source had already delivered (deduped, not re-inserted). */
  skipped: number
  errors: number
  budgetExhausted?: boolean
  /** Emails the source could not read (tolerant email parsers count, never throw). */
  parseFailures?: number
}

export type GmailSyncSummary =
  | { kind: 'gmail-sync'; checked: number; matched: number; logged: number }
  | { kind: 'gmail-sync'; skipped: 'no_google_account' }

export type DigestSkipReason = 'disabled' | 'not_monday' | 'already_sent' | 'no_google_account'
export type DigestSummary = { kind: 'digest'; sent: true } | { kind: 'digest'; sent: false; reason: DigestSkipReason }

export type FollowupsSummary = { kind: 'followups'; nudged: number }
export type RemindersSummary = { kind: 'reminders'; added: number }
export type UsageSnapshotSummary = { kind: 'usage-snapshot'; throttles: string[]; todosCreated: number }
export type ScamReassessSummary = { kind: 'scam-reassess'; reassessed: number; paused?: boolean }
export type DiscoveryEmailSummary =
  | { kind: 'discovery-email'; sent: true; count: number }
  | { kind: 'discovery-email'; sent: false; reason?: 'disabled' | 'no_matches' | 'no_google_account' }

export type ShortlistSummary = { kind: 'shortlist'; candidates: number; shortlisted: number }
export type CompanyDiscoverySummary = {
  kind: 'company-discovery'
  fetched: number
  new: number
  updated: number
  failed: number
  paused?: boolean
  careersChanged?: number
}
export type CompanyEnrichSummary = { kind: 'company-enrich'; checked: number; careers: number; boards: number; blocked: number; remaining: number }

export type { RadarRunSummary } from '@/lib/radar/summary'
export type { WhatsNewRunSummary } from '@/lib/radar/new/summary'

export type JobSummary =
  | DiscoverySourceSummary
  | RadarRunSummary
  | WhatsNewRunSummary
  | ShortlistSummary
  | CompanyDiscoverySummary
  | CompanyEnrichSummary
  | GmailSyncSummary
  | DigestSummary
  | FollowupsSummary
  | RemindersSummary
  | UsageSnapshotSummary
  | ScamReassessSummary
  | DiscoveryEmailSummary

/** One failed attempt, kept on the job row so history shows every retry. */
export interface AttemptError {
  attempt: number
  /** ISO timestamp. */
  at: string
  /** Sanitized (lib/queue/errors.ts sanitizeError). */
  message: string
}

/** `queue_jobs.result`. */
export interface JobRunRecord {
  summary?: JobSummary | null
  errors?: AttemptError[]
}

/**
 * Upper bound on a stored run record (JSON bytes): a summary of at most
 * SUMMARY_BUDGET_BYTES plus MAX_ATTEMPT_ERRORS errors of at most ~370 bytes
 * each (300-char sanitized message + attempt/at) stays under it.
 */
export const MAX_RUN_RECORD_BYTES = 2048
/** Failed attempts kept per job (newest). */
export const MAX_ATTEMPT_ERRORS = 4

const MAX_LABEL = 80
export const SUMMARY_BUDGET_BYTES = 512

function jsonBytes(v: unknown): number {
  return new TextEncoder().encode(JSON.stringify(v)).length
}

/**
 * Bound a handler summary before it is stored: labels truncated, string
 * lists shortened, and — should it still exceed the byte cap — replaced by
 * `null` rather than stored partially.
 */
export function capSummary(summary: JobSummary | undefined | null): JobSummary | null {
  if (!summary) return null
  const s = { ...summary } as JobSummary
  if (s.kind === 'discovery-source') s.source = s.source.slice(0, MAX_LABEL)
  if (s.kind === 'usage-snapshot') s.throttles = s.throttles.slice(0, 10).map((t) => t.slice(0, 40))
  if ((s.kind === 'radar-source' || s.kind === 'radar-new') && s.error) s.error = s.error.slice(0, 160)
  return jsonBytes(s) > SUMMARY_BUDGET_BYTES ? null : s
}

/** Parse a stored `result` defensively (old rows are null; shapes may drift). */
export function readRunRecord(raw: unknown): JobRunRecord {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as { summary?: unknown; errors?: unknown }
  const summary =
    r.summary && typeof r.summary === 'object' && typeof (r.summary as { kind?: unknown }).kind === 'string'
      ? (r.summary as JobSummary)
      : null
  const errors = Array.isArray(r.errors)
    ? (r.errors as unknown[]).flatMap((e): AttemptError[] => {
        const x = e as Partial<AttemptError> | null
        return x && typeof x.message === 'string'
          ? [{ attempt: Number(x.attempt ?? 0), at: String(x.at ?? ''), message: x.message }]
          : []
      })
    : []
  return { summary, errors }
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

const DIGEST_REASON: Record<DigestSkipReason, string> = {
  disabled: 'digest is off',
  not_monday: 'not Monday in your timezone',
  already_sent: 'already sent this week',
  no_google_account: 'no Google account',
}

/** One line for the Last runs table, e.g. "12 found · 3 new · 1 quarantined". */
export function describeSummary(summary: JobSummary | null | undefined): string {
  if (!summary) return ''
  switch (summary.kind) {
    case 'discovery-source': {
      if (summary.status === 'paused') return `${summary.source}: paused by the usage throttle`
      if (summary.status === 'skipped') return `${summary.source}: skipped`
      if (summary.status === 'failed') return `${summary.source}: poll failed`
      const parts = [`${summary.fetched} found`, `${summary.new} new`]
      if (summary.scored > 0) parts.push(`${summary.scored} scored`)
      if (summary.quarantined > 0) parts.push(`${summary.quarantined} quarantined`)
      if (summary.parseFailures) parts.push(`${summary.parseFailures} unreadable`)
      if (summary.budgetExhausted) parts.push('out of time')
      return `${summary.source}: ${parts.join(' · ')}`
    }
    case 'gmail-sync':
      return 'skipped' in summary
        ? 'Skipped: no Google account'
        : `${summary.checked} checked · ${summary.matched} matched · ${summary.logged} logged`
    case 'digest':
      return summary.sent ? 'Digest sent' : `Not sent: ${DIGEST_REASON[summary.reason]}`
    case 'followups':
      return plural(summary.nudged, 'follow-up') + ' nudged'
    case 'reminders':
      return plural(summary.added, 'reminder') + ' added'
    case 'usage-snapshot':
      return summary.throttles.length === 0
        ? 'Snapshot taken · no throttles'
        : `Snapshot taken · throttles: ${summary.throttles.join(', ')}`
    case 'scam-reassess':
      return summary.paused ? 'Paused by the usage throttle' : plural(summary.reassessed, 'listing') + ' re-checked'
    case 'shortlist':
      return `${plural(summary.shortlisted, 'posting')} shortlisted from ${plural(summary.candidates, 'candidate')}`
    case 'discovery-email':
      if (summary.sent) return `Sent · ${plural(summary.count, 'match', 'matches')}`
      if (summary.reason === 'no_google_account') return 'Not sent: no Google account'
      if (summary.reason === 'disabled') return 'Not sent: email alerts are off'
      return 'Nothing new to send'
    case 'radar-source':
      return describeRadarSummary(summary)
    case 'radar-new':
      return describeWhatsNewSummary(summary)
    case 'company-discovery': {
      if (summary.paused) return 'Paused by the usage throttle'
      const parts = [`${summary.fetched} found`, `${summary.new} new`, `${summary.updated} updated`]
      if (summary.failed > 0) parts.push(`${plural(summary.failed, 'source')} failed`)
      if (summary.careersChanged) parts.push(`${plural(summary.careersChanged, 'careers page')} changed`)
      return parts.join(' · ')
    }
    case 'company-enrich':
      return `${summary.checked} checked · ${summary.careers} careers pages · ${summary.boards} job boards · ${summary.blocked} skipped by robots.txt`
    default:
      return ''
  }
}
