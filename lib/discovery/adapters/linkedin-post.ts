import * as messagesQ from '@/lib/db/queries/linkedinPostMessages'
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
import { looksLikePostEmail, parseLinkedInPostEmail, type PostEmailKind } from '@/lib/linkedin-posts/email-parse'
import { buildHiringPost } from '@/lib/linkedin-posts/post'
import { linkedInPostQuery, verifyLinkedInSender } from '@/lib/linkedin-posts/sender'
import { e2eGmailFixturesEnabled, e2eInbox } from '@/lib/linkedin-posts/e2e-inbox'
import { GmailNotConnectedError } from './email-alert'
import type { AdapterContext, DiscoveryAdapter, DiscoveryItem } from './types'

/**
 * `linkedin_post` — hiring posts from the user's OWN LinkedIn notification
 * emails ("X posted", "X shared a post", "Top posts for you"), read from
 * Gmail with the read-only scope lee already has. lee never opens
 * linkedin.com: LinkedIn forbids automated access and reading other
 * members' posts through its API is partner-only.
 *
 * Each poll lists recent LinkedIn notification messages, keeps those Google
 * verified (DMARC / DKIM pass for linkedin.com), parses each body IN MEMORY
 * and keeps only posts the hiring classifier accepts. The body is never
 * stored: a discovery keeps the extracted fields and a ≤ 1 KB snippet.
 * Notification formats change often, so an email that looks like a post
 * notification but yields no post is counted as a parse failure (run
 * summary and Settings › LinkedIn), never thrown.
 */

export const POST_WINDOW_DAYS = 7
export const MAX_POST_MESSAGES = 40
const MESSAGE_CONCURRENCY = 4
const COUNTER_RETENTION_DAYS = 120

export interface LinkedInPostDeps {
  getTokens: (userId: string) => Promise<GmailTokens>
  listMessageIds: typeof listMessageIds
  getMessageContent: typeof getMessageContent
  record: typeof messagesQ.record
  prune: typeof messagesQ.pruneOlderThan
  now: () => Date
}

function e2eDeps(): Pick<LinkedInPostDeps, 'getTokens' | 'listMessageIds' | 'getMessageContent'> {
  return {
    getTokens: async () => ({ accessToken: 'e2e' }),
    listMessageIds: async () => e2eInbox().map((m) => ({ id: m.id, threadId: m.id })),
    getMessageContent: async ({ id }) => {
      const m = e2eInbox().find((x) => x.id === id)
      if (!m) throw new Error('gone')
      return m
    },
  }
}

function defaultDeps(): LinkedInPostDeps {
  return {
    getTokens: getGoogleTokens,
    listMessageIds,
    getMessageContent,
    record: messagesQ.record,
    prune: messagesQ.pruneOlderThan,
    now: () => new Date(),
    ...(e2eGmailFixturesEnabled() ? e2eDeps() : {}),
  }
}

function header(msg: GmailMessageContent, name: string): string[] {
  const lower = name.toLowerCase()
  return msg.headers.filter((h) => h.name.toLowerCase() === lower).map((h) => h.value)
}

interface ReadMessage {
  ref: GmailMessageRef
  kind: PostEmailKind
  receivedAt: Date
  postsFound: number
  items: DiscoveryItem[]
  parseFailed: boolean
}

export class LinkedInPostAdapter implements DiscoveryAdapter {
  readonly kind = 'linkedin_post'

  constructor(private readonly deps?: LinkedInPostDeps) {}

  private get d(): LinkedInPostDeps {
    return this.deps ?? defaultDeps()
  }

  async fetch(_config: unknown, ctx?: AdapterContext): Promise<DiscoveryItem[]> {
    if (!ctx?.userId) throw new Error('linkedin_post needs a user')
    const { userId } = ctx
    const d = this.d
    let tokens: GmailTokens
    try {
      tokens = await d.getTokens(userId)
    } catch (e) {
      if (e instanceof NoGoogleAccountError) throw new GmailNotConnectedError()
      throw e
    }
    const refs = await d.listMessageIds({ tokens, q: linkedInPostQuery(POST_WINDOW_DAYS), maxResults: MAX_POST_MESSAGES })
    const read = await mapWithConcurrency(refs, MESSAGE_CONCURRENCY, (ref) => this.readOne(d, userId, tokens, ref))
    const messages = read.filter((m): m is ReadMessage => m !== null)

    await d.record(
      userId,
      messages.map((m) => ({
        messageId: m.ref.id,
        kind: m.kind,
        receivedAt: m.receivedAt,
        postsFound: m.postsFound,
        hiringFound: m.items.length,
        parseFailed: m.parseFailed,
      })),
    )
    await d.prune(userId, new Date(d.now().getTime() - COUNTER_RETENTION_DAYS * 86_400_000)).catch(() => undefined)
    ctx.report?.({ parseFailures: messages.filter((m) => m.parseFailed).length })

    const items = new Map<string, DiscoveryItem>()
    // Newest message first (Gmail order): a post's newest notification wins.
    for (const m of messages) for (const item of m.items) if (!items.has(item.sourceItemId)) items.set(item.sourceItemId, item)
    return [...items.values()]
  }

  /** One message → its hiring posts, or null when unverified. Never throws. */
  private async readOne(d: LinkedInPostDeps, userId: string, tokens: GmailTokens, ref: GmailMessageRef): Promise<ReadMessage | null> {
    let msg: GmailMessageContent
    try {
      msg = await d.getMessageContent({ tokens, id: ref.id })
    } catch (err) {
      logger.warn('linkedin_post_message_failed', { userId, messageId: ref.id, error: err instanceof Error ? err.message : String(err) })
      return null
    }
    const from = extractEmailAddress(header(msg, 'From')[0])
    if (!verifyLinkedInSender(from, header(msg, 'Authentication-Results'))) return null
    const subject = header(msg, 'Subject')[0] ?? ''
    const ms = Number(msg.internalDate)
    const receivedAt = Number.isFinite(ms) && ms > 0 ? new Date(ms) : d.now()
    try {
      const parsed = parseLinkedInPostEmail({ subject, html: msg.html, text: msg.text })
      const items = parsed.posts
        .map((p) =>
          buildHiringPost(
            { via: 'email', link: { key: p.key, url: p.url }, posterName: p.posterName, posterHeadline: p.posterHeadline, posterUrl: p.posterUrl, text: p.snippet },
            receivedAt,
          ),
        )
        .filter((h) => h.verdict.hiring && h.item)
        .map((h) => h.item!)
      return {
        ref,
        kind: parsed.kind,
        receivedAt,
        postsFound: parsed.posts.length,
        items,
        parseFailed: parsed.posts.length === 0 && looksLikePostEmail(subject),
      }
    } catch (err) {
      logger.warn('linkedin_post_parse_failed', { userId, messageId: ref.id, error: err instanceof Error ? err.name : 'unknown' })
      return { ref, kind: 'other', receivedAt, postsFound: 0, items: [], parseFailed: true }
    }
  }
}
