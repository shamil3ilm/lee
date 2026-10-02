import * as emailAlertsQ from '@/lib/db/queries/emailAlerts'
import {
  extractEmailAddress,
  getMessageContent,
  listMessageIds,
  type GmailMessageContent,
  type GmailMessageRef,
  type GmailTokens,
} from '@/lib/gmail/adapter'
import { getGoogleTokens, NoGoogleAccountError } from '@/lib/google/tokens'
import { logger } from '@/lib/logger'
import { mapWithConcurrency } from '@/lib/util/concurrency'
import { parseAlertEmail, type AlertJob } from '@/lib/email-alerts/parse'
import { verifyAlertSender } from '@/lib/email-alerts/sender'
import { alertSendersQuery } from '@/lib/email-alerts/sites'
import type { AdapterContext, DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'

/**
 * `email_alert` — job-alert emails from Indeed, LinkedIn, Naukri,
 * NaukriGulf, Bayt, GulfTalent and Glassdoor, read from the user's Gmail
 * (gmail.readonly, already granted for Gmail sync).
 *
 * Each poll lists recent messages from the known sender domains, keeps only
 * those Google verified (DMARC / DKIM pass for the site's domain), parses
 * each body IN MEMORY and returns one discovery per job. The body is never
 * stored: a discovery's raw payload is just the extracted fields plus the
 * site and message id. Jobs repeat across alerts; the normal ingest dedupe
 * on (source, `${site}:${jobKey}`) keeps one row per posting.
 *
 * Re-reading the whole window every poll (instead of remembering which
 * messages were read) lets the ingest path retry scoring for jobs a
 * previous run left unscored, exactly like the other adapters.
 */

export const ALERT_WINDOW_DAYS = 7
export const MAX_ALERT_MESSAGES = 50
const MESSAGE_CONCURRENCY = 4
const COUNTER_RETENTION_DAYS = 120

/** Subject words that mark a job alert (non-alert mail from these domains is ignored). */
const ALERT_SUBJECT_TERMS = ['job', 'jobs', 'alert', 'opening', 'openings', 'vacancy', 'vacancies', 'hiring', 'role', 'roles']

export function alertQuery(days = ALERT_WINDOW_DAYS): string {
  return `${alertSendersQuery(days)} subject:(${ALERT_SUBJECT_TERMS.join(' OR ')})`
}

export class GmailNotConnectedError extends Error {
  constructor() {
    super('Connect Google with Gmail access (Settings › Integrations) to read job-alert emails.')
    this.name = 'GmailNotConnectedError'
  }
}

export interface EmailAlertDeps {
  getTokens: (userId: string) => Promise<GmailTokens>
  listMessageIds: typeof listMessageIds
  getMessageContent: typeof getMessageContent
  record: typeof emailAlertsQ.record
  prune: typeof emailAlertsQ.pruneOlderThan
  now: () => Date
}

const defaultDeps: EmailAlertDeps = {
  getTokens: getGoogleTokens,
  listMessageIds,
  getMessageContent,
  record: emailAlertsQ.record,
  prune: emailAlertsQ.pruneOlderThan,
  now: () => new Date(),
}

function headerValues(msg: GmailMessageContent, name: string): string[] {
  const lower = name.toLowerCase()
  return msg.headers.filter((h) => h.name.toLowerCase() === lower).map((h) => h.value)
}

function remoteTypeOf(location: string | undefined): NormalizedJob['remoteType'] {
  const l = (location ?? '').toLowerCase()
  if (/\bremote\b|work from home/.test(l)) return 'remote'
  if (/\bhybrid\b/.test(l)) return 'hybrid'
  if (/on-?site/.test(l)) return 'onsite'
  return 'unknown'
}

export function alertJobToItem(job: AlertJob, messageId: string, receivedAt: Date): DiscoveryItem {
  const raw = {
    site: job.site,
    messageId,
    receivedAt: receivedAt.toISOString(),
    title: job.title,
    company: job.company,
    location: job.location ?? null,
    url: job.url,
    canonical: job.canonical,
  }
  const normalized: NormalizedJob = {
    kind: 'job',
    title: job.title,
    companyName: job.company,
    location: job.location,
    remoteType: remoteTypeOf(job.location),
    employmentType: 'unknown',
    descriptionMd: '',
    applyUrl: job.url,
    postedAt: receivedAt,
    techStack: [],
    subSource: job.site,
    tags: ['via:email_alert', `site:${job.site}`, job.canonical ? 'link:canonical' : 'link:raw'],
    raw,
  }
  return { sourceItemId: `${job.site}:${job.jobKey}`, raw, normalized }
}

interface ParsedMessage {
  ref: GmailMessageRef
  site: string
  receivedAt: Date
  jobs: AlertJob[]
}

export class EmailAlertAdapter implements DiscoveryAdapter {
  readonly kind = 'email_alert'

  constructor(private readonly deps: EmailAlertDeps = defaultDeps) {}

  async fetch(_config: unknown, ctx?: AdapterContext): Promise<DiscoveryItem[]> {
    if (!ctx?.userId) throw new Error('email_alert needs a user')
    const { userId } = ctx
    let tokens: GmailTokens
    try {
      tokens = await this.deps.getTokens(userId)
    } catch (e) {
      if (e instanceof NoGoogleAccountError) throw new GmailNotConnectedError()
      throw e
    }
    const refs = await this.deps.listMessageIds({ tokens, q: alertQuery(), maxResults: MAX_ALERT_MESSAGES })
    const parsed = await mapWithConcurrency(refs, MESSAGE_CONCURRENCY, (ref) => this.readOne(userId, tokens, ref))
    const messages = parsed.filter((m): m is ParsedMessage => m !== null)

    await this.deps.record(
      userId,
      messages.map((m) => ({ messageId: m.ref.id, site: m.site, receivedAt: m.receivedAt, jobsFound: m.jobs.length })),
    )
    await this.deps
      .prune(userId, new Date(this.deps.now().getTime() - COUNTER_RETENTION_DAYS * 86_400_000))
      .catch(() => undefined)

    const items = new Map<string, DiscoveryItem>()
    // Newest message first (Gmail order), so a job's newest alert wins.
    for (const m of messages) {
      for (const job of m.jobs) {
        const item = alertJobToItem(job, m.ref.id, m.receivedAt)
        if (!items.has(item.sourceItemId)) items.set(item.sourceItemId, item)
      }
    }
    return [...items.values()]
  }

  /** One message → its jobs, or null when unverified / unreadable. Never throws. */
  private async readOne(userId: string, tokens: GmailTokens, ref: GmailMessageRef): Promise<ParsedMessage | null> {
    try {
      const msg = await this.deps.getMessageContent({ tokens, id: ref.id })
      const from = extractEmailAddress(headerValues(msg, 'From')[0])
      const sender = verifyAlertSender(from, headerValues(msg, 'Authentication-Results'))
      if (!sender) return null
      const jobs = parseAlertEmail({ site: sender.site.id, html: msg.html, text: msg.text })
      const ms = Number(msg.internalDate)
      const receivedAt = Number.isFinite(ms) && ms > 0 ? new Date(ms) : this.deps.now()
      return { ref, site: sender.site.id, receivedAt, jobs }
    } catch (err) {
      logger.warn('email_alert_message_failed', {
        userId,
        messageId: ref.id,
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }
}
