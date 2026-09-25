import type { CSSProperties, ReactElement } from 'react'
import { and, desc, eq, gt, gte } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { discoveries, users } from '@/lib/db/schema'
import * as profileQ from '@/lib/db/queries/profile'
import { sendEmail as defaultSendEmail } from '@/lib/gmail/send'
import { logger } from '@/lib/logger'

const DAY_MS = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Slim view of a discovery for use in notification payloads. We do NOT expose
 * the full row — the email template only needs title, company, score, and a
 * short reasoning excerpt so callers can render safe HTML without touching
 * jsonb blobs directly.
 */
export interface NotifiableDiscovery {
  id: string
  title: string
  companyName: string | null
  matchScore: number
  reasoningExcerpt: string | null
  createdAt: Date
}

export interface SendDiscoveryEmailArgs {
  userId: string
  sendEmail?: typeof defaultSendEmail
  now?: Date
  /**
   * Optional override for the "since" window when a discovery_email_last_sent_at
   * is null. Used by the /test endpoint to preview a 7-day window rather than
   * the default 24h.
   */
  fallbackWindowMs?: number
}

export interface SendDiscoveryEmailResult {
  sent: boolean
  count: number
  messageId?: string
  /** Reason a send was skipped — surfaced by the test endpoint. */
  reason?: 'disabled' | 'no_matches'
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Return discoveries eligible for a notification: `status = 'new'`, a
 * matchScore at or above `minScore`, and createdAt strictly after
 * `sinceIso`. Ordered by matchScore descending so the top match is first.
 * Bounded to 25 rows — an email or push with hundreds of items is noise
 * rather than signal.
 */
export async function findNotifiableDiscoveries(
  userId: string,
  minScore: number,
  sinceIso: string,
  client: DbClient = db,
): Promise<NotifiableDiscovery[]> {
  const since = new Date(sinceIso)
  if (Number.isNaN(since.getTime())) {
    throw new Error(`findNotifiableDiscoveries: invalid sinceIso ${sinceIso}`)
  }
  const rows = await client
    .select({
      id: discoveries.id,
      normalized: discoveries.normalized,
      matchScore: discoveries.matchScore,
      matchReasoning: discoveries.matchReasoning,
      createdAt: discoveries.createdAt,
    })
    .from(discoveries)
    .where(
      and(
        eq(discoveries.userId, userId),
        eq(discoveries.status, 'new'),
        gte(discoveries.matchScore, minScore),
        gt(discoveries.createdAt, since),
      ),
    )
    .orderBy(desc(discoveries.matchScore), desc(discoveries.createdAt))
    .limit(25)

  return rows
    .filter((r): r is typeof r & { matchScore: number } => r.matchScore !== null)
    .map((r) => {
      const n = (r.normalized ?? {}) as {
        title?: string
        companyName?: string
        company?: { name?: string }
      }
      return {
        id: r.id,
        title: n.title ?? 'Untitled role',
        companyName: n.companyName ?? n.company?.name ?? null,
        matchScore: r.matchScore,
        reasoningExcerpt: extractReasoningExcerpt(r.matchReasoning),
        createdAt: r.createdAt,
      }
    })
}

/**
 * Pull the first useful string out of the AI scoring blob. Different scoring
 * providers stash the summary under different keys (`summary`, `reasoning`,
 * `notes`); we try a few and truncate to 180 chars so the email row stays
 * scannable. Returns null when no readable text is found — the template will
 * just omit the excerpt.
 */
function extractReasoningExcerpt(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const blob = raw as Record<string, unknown>
  const candidateKeys = ['summary', 'reasoning', 'notes', 'why', 'explanation']
  for (const key of candidateKeys) {
    const v = blob[key]
    if (typeof v === 'string' && v.trim().length > 0) {
      const trimmed = v.trim().replace(/\s+/g, ' ')
      return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Email template
// ---------------------------------------------------------------------------

// Inline styles only — same rationale as the weekly digest template.
const styles: Record<string, CSSProperties> = {
  wrapper: {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    maxWidth: '600px',
    margin: '0 auto',
    padding: '24px',
    color: '#1a1a1a',
    fontSize: '14px',
    lineHeight: 1.5,
    backgroundColor: '#ffffff',
  },
  h1: { fontSize: '20px', margin: '0 0 4px 0', fontWeight: 600 },
  subline: { color: '#666', margin: '0 0 20px 0', fontSize: '13px' },
  item: {
    padding: '12px 0',
    borderBottom: '1px solid #eee',
  },
  itemTitle: { fontWeight: 600, fontSize: '14px', margin: 0 },
  itemMeta: { color: '#666', fontSize: '12px', margin: '2px 0 0 0' },
  itemReasoning: { color: '#333', fontSize: '13px', margin: '6px 0 0 0' },
  scoreChip: {
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: '10px',
    backgroundColor: '#eef7ee',
    color: '#1a5c1a',
    fontSize: '11px',
    fontWeight: 600,
    marginLeft: '6px',
  },
  footer: {
    marginTop: '24px',
    paddingTop: '12px',
    borderTop: '1px solid #eee',
    color: '#888',
    fontSize: '12px',
  },
  link: { color: '#1a1a1a', textDecoration: 'underline' },
  ctaLine: { marginTop: '16px', fontSize: '13px' },
}

export interface BuildDiscoveryEmailArgs {
  discoveries: NotifiableDiscovery[]
  userEmail: string
  appBaseUrl?: string
}

export interface BuiltDiscoveryEmail {
  subject: string
  htmlBody: string
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

/**
 * Compose subject line. Single match → "New match: Title @ Company"; multi
 * match → "N new job matches — Top @ Co, Next @ Co, ..." (max 3 items, then
 * "…"). Kept under ~90 chars so the whole subject renders in a Gmail row.
 */
function buildSubject(items: NotifiableDiscovery[]): string {
  if (items.length === 1) {
    const only = items[0]
    if (!only) return 'New job match'
    const co = only.companyName ? ` @ ${only.companyName}` : ''
    return truncate(`New match: ${only.title}${co}`, 90)
  }
  const previews = items
    .slice(0, 3)
    .map((d) => `${d.title}${d.companyName ? ` @ ${d.companyName}` : ''}`)
    .join(', ')
  const tail = items.length > 3 ? ', …' : ''
  return truncate(`${items.length} new job matches — ${previews}${tail}`, 90)
}

function DiscoveryEmail({
  discoveries: items,
  appBaseUrl,
}: {
  discoveries: NotifiableDiscovery[]
  appBaseUrl: string
}): ReactElement {
  return (
    <div style={styles.wrapper}>
      <h1 style={styles.h1}>
        {items.length === 1
          ? '1 new job match'
          : `${items.length} new job matches`}
      </h1>
      <p style={styles.subline}>
        Fresh from your discovery sources — sorted by match score.
      </p>

      {items.map((d) => (
        <div key={d.id} style={styles.item}>
          <p style={styles.itemTitle}>
            {d.title}
            <span style={styles.scoreChip}>{d.matchScore}% match</span>
          </p>
          <p style={styles.itemMeta}>
            {d.companyName ?? 'Unknown company'}
          </p>
          {d.reasoningExcerpt ? (
            <p style={styles.itemReasoning}>{d.reasoningExcerpt}</p>
          ) : null}
        </div>
      ))}

      <div style={styles.ctaLine}>
        <a href={`${appBaseUrl}/discoveries`} style={styles.link}>
          View all discoveries →
        </a>
      </div>

      <div style={styles.footer}>
        Sent by Employ. Manage this in your{' '}
        <a href={`${appBaseUrl}/settings/notifications`} style={styles.link}>
          notification settings
        </a>
        .
      </div>
    </div>
  )
}

/**
 * Render the discovery notification email to a static HTML string suitable
 * for the `htmlBody` of a Gmail send. Uses a runtime require of
 * react-dom/server (same pattern as the weekly digest) so the server-only
 * import doesn't leak into a client bundle.
 */
export function buildDiscoveryEmail(
  args: BuildDiscoveryEmailArgs,
): BuiltDiscoveryEmail {
  const appBaseUrl = args.appBaseUrl ?? 'https://employ4me.vercel.app'
  const subject = buildSubject(args.discoveries)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { renderToStaticMarkup } = require('react-dom/server') as {
    renderToStaticMarkup: (el: ReactElement) => string
  }
  const body = renderToStaticMarkup(
    <DiscoveryEmail
      discoveries={args.discoveries}
      appBaseUrl={appBaseUrl}
    />,
  )
  const htmlBody = `<!doctype html><html><head><meta charset="utf-8"><title>Employ · New matches</title></head><body style="margin:0;padding:0;background:#f7f7f7;">${body}</body></html>`
  return { subject, htmlBody }
}

// ---------------------------------------------------------------------------
// Send entry point
// ---------------------------------------------------------------------------

/**
 * Fire the discovery email for `userId` when there is at least one new
 * eligible discovery since the last send. Idempotency: the profile column
 * `discovery_email_last_sent_at` is bumped on every successful send so a
 * subsequent same-cycle call within the same discovery batch would find no
 * new rows and skip cleanly.
 *
 * Silently returns `{ sent: false }` for the opt-out case; throws only on
 * genuine transport failures (Gmail 5xx, network error) so the cron loop can
 * count them as real errors. `NoGoogleAccountError` bubbles up — the cron
 * caller catches it (same pattern as gmail/digest).
 */
export async function sendDiscoveryEmailIfEnabled(
  args: SendDiscoveryEmailArgs,
): Promise<SendDiscoveryEmailResult> {
  const send = args.sendEmail ?? defaultSendEmail
  const now = args.now ?? new Date()
  const profile = await profileQ.get(args.userId)
  if (!profile?.notifyDiscoveryEmail) {
    return { sent: false, count: 0, reason: 'disabled' }
  }

  const fallbackWindow = args.fallbackWindowMs ?? DAY_MS
  const sinceDate = profile.discoveryEmailLastSentAt ?? new Date(now.getTime() - fallbackWindow)
  const items = await findNotifiableDiscoveries(
    args.userId,
    profile.notifyDiscoveryMinScore,
    sinceDate.toISOString(),
  )
  if (items.length === 0) {
    return { sent: false, count: 0, reason: 'no_matches' }
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, args.userId) })
  if (!user?.email) {
    throw new Error(`sendDiscoveryEmailIfEnabled: user ${args.userId} has no email`)
  }
  const { subject, htmlBody } = buildDiscoveryEmail({
    discoveries: items,
    userEmail: user.email,
  })
  const result = await send({
    userId: args.userId,
    to: user.email,
    subject,
    htmlBody,
  })
  await profileQ.upsert(args.userId, { discoveryEmailLastSentAt: now })
  logger.info('discovery_email_sent', {
    userId: args.userId,
    messageId: result.messageId,
    count: items.length,
    topScore: items[0]?.matchScore,
  })
  return { sent: true, count: items.length, messageId: result.messageId }
}
