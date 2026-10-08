import { createHash } from 'node:crypto'
import { z } from 'zod'
import * as discQ from '@/lib/db/queries/discoveries'
import {
  extractEmailAddress,
  getMessageContent,
  listMessageIds,
  type GmailMessageContent,
  type GmailTokens,
} from '@/lib/gmail/adapter'
import { getGoogleTokens, NoGoogleAccountError } from '@/lib/google/tokens'
import { fetchPage } from '@/lib/ingest/fetch'
import { logger } from '@/lib/logger'
import { mapWithConcurrency } from '@/lib/util/concurrency'
import { siteName } from '@/lib/google-alerts/links'
import { parseGoogleAlertEmail, parseGoogleAlertFeed, type GoogleAlertItem } from '@/lib/google-alerts/parse'
import { GOOGLE_ALERTS_SENDER, verifyGoogleAlertSender } from '@/lib/google-alerts/sender'
import { fetchJd, jdTarget } from '../match/jd-fetch'
import type { AdapterContext, DiscoveryAdapter, DiscoveryItem, NormalizedJob } from './types'

/**
 * `google_alerts` — the user's own Google Alerts for job searches.
 *   Email: alerts from googlealerts-noreply@google.com in Gmail (verified
 *   like every job alert: DMARC/DKIM pass for google.com), parsed in memory.
 *   RSS (optional): the alert's feed URL the user pastes
 *   (https://www.google.com/alerts/feeds/…), read once per daily poll with
 *   the SSRF-safe fetch — Google provides it for feed readers.
 * Links are unwrapped offline and google.com-only links dropped. A result on
 * an ATS with a public job API (Greenhouse, Lever) gets its full JD;
 * everything else stays "Low confidence: title only" with Paste the JD.
 * A URL the user already has from another source is skipped.
 */

export const GOOGLE_ALERTS_WINDOW_DAYS = 7
export const MAX_GOOGLE_ALERT_MESSAGES = 30
export const MAX_ENRICH_PER_POLL = 8
const FEED_RE = /^https:\/\/www\.google\.com\/alerts\/feeds\/\d{5,30}\/\d{5,40}$/

export const googleAlertsConfigSchema = z.object({
  email: z.boolean().default(true),
  rssUrl: z.string().regex(FEED_RE).nullable().default(null),
})

export interface GoogleAlertsDeps {
  getTokens: (userId: string) => Promise<GmailTokens>
  listMessageIds: typeof listMessageIds
  getMessageContent: typeof getMessageContent
  fetchFeed: (url: string) => Promise<string>
  fetchJd: typeof fetchJd
  existingUrls: (userId: string, urls: readonly string[]) => Promise<Set<string>>
}

const defaultDeps: GoogleAlertsDeps = {
  getTokens: getGoogleTokens,
  listMessageIds,
  getMessageContent,
  fetchFeed: async (url) => (await fetchPage(url)).html,
  fetchJd,
  existingUrls: discQ.existingApplyUrls,
}

function header(msg: GmailMessageContent, name: string): string[] {
  return msg.headers.filter((h) => h.name.toLowerCase() === name.toLowerCase()).map((h) => h.value)
}

export function googleAlertToItem(item: GoogleAlertItem, via: 'email' | 'rss', descriptionMd = item.snippet): DiscoveryItem {
  const id = createHash('sha1').update(item.url).digest('hex').slice(0, 20)
  const raw = { via, title: item.title, url: item.url, snippet: item.snippet }
  const normalized: NormalizedJob = {
    kind: 'job',
    title: item.title,
    companyName: siteName(item.url),
    employmentType: 'unknown',
    remoteType: 'unknown',
    descriptionMd,
    applyUrl: item.url,
    ...(item.publishedAt ? { postedAt: item.publishedAt } : {}),
    techStack: [],
    subSource: 'google_alerts',
    tags: ['via:google_alerts', `delivery:${via}`],
    raw,
  }
  return { sourceItemId: `ga:${id}`, raw, normalized }
}

export class GoogleAlertsAdapter implements DiscoveryAdapter {
  readonly kind = 'google_alerts'

  constructor(private readonly deps: GoogleAlertsDeps = defaultDeps) {}

  async fetch(config: unknown, ctx?: AdapterContext): Promise<DiscoveryItem[]> {
    if (!ctx?.userId) throw new Error('google_alerts needs a user')
    const cfg = googleAlertsConfigSchema.parse(config ?? {})
    const found = new Map<string, { item: GoogleAlertItem; via: 'email' | 'rss' }>()
    if (cfg.email) for (const item of await this.fromEmail(ctx.userId)) found.set(item.url, { item, via: 'email' })
    if (cfg.rssUrl) {
      for (const item of parseGoogleAlertFeed(await this.deps.fetchFeed(cfg.rssUrl))) {
        if (!found.has(item.url)) found.set(item.url, { item, via: 'rss' })
      }
    }
    const known = await this.deps.existingUrls(ctx.userId, [...found.keys()])
    const fresh = [...found.values()].filter((f) => !known.has(f.item.url))
    let enriched = 0
    return mapWithConcurrency(fresh, 2, async ({ item, via }) => {
      const target = jdTarget(item.url)
      if (target && enriched < MAX_ENRICH_PER_POLL) {
        enriched += 1
        const jd = await this.deps.fetchJd(target).catch(() => null)
        if (jd) return googleAlertToItem(item, via, jd)
      }
      return googleAlertToItem(item, via)
    })
  }

  private async fromEmail(userId: string): Promise<GoogleAlertItem[]> {
    let tokens: GmailTokens
    try {
      tokens = await this.deps.getTokens(userId)
    } catch (e) {
      if (e instanceof NoGoogleAccountError) return []
      throw e
    }
    const q = `from:${GOOGLE_ALERTS_SENDER} newer_than:${GOOGLE_ALERTS_WINDOW_DAYS}d`
    const refs = await this.deps.listMessageIds({ tokens, q, maxResults: MAX_GOOGLE_ALERT_MESSAGES })
    const lists = await mapWithConcurrency(refs, 4, async (ref) => {
      try {
        const msg = await this.deps.getMessageContent({ tokens, id: ref.id })
        const from = extractEmailAddress(header(msg, 'From')[0])
        if (!verifyGoogleAlertSender(from, header(msg, 'Authentication-Results'))) return []
        return parseGoogleAlertEmail({ html: msg.html, text: msg.text })
      } catch (err) {
        logger.warn('google_alert_message_failed', { userId, messageId: ref.id, error: err instanceof Error ? err.message : String(err) })
        return []
      }
    })
    return lists.flat()
  }
}
