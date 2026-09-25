import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sendDiscoveryEmailIfEnabled } from '@/lib/notifications/discovery'
import * as profileQ from '@/lib/db/queries/profile'
import { NoGoogleAccountError } from '@/lib/google/tokens'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * POST /api/notifications/discovery/test
 *
 * Ad-hoc send to preview the discovery email. Widens the "since" window to
 * 7 days (default cron path uses 24h) so there's usually at least one match
 * to render. The flag guard (`notifyDiscoveryEmail`) is bypassed here — the
 * button is for verifying setup and users often toggle after seeing a preview.
 *
 * Returns:
 *   { sent, count, messageId? }        — real send happened
 *   { sent: false, reason: 'no_matches' } — nothing to send in the window
 *   400 when Google isn't linked, 500 for transport failures.
 */
export async function POST(): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

    // Temporarily force-enable email for this call — flip the flag on if it
    // was off, then restore. This lets the button work even before the user
    // saves the toggle.
    const profile = await profileQ.get(userId)
    const originalFlag = profile?.notifyDiscoveryEmail ?? false
    if (!originalFlag) {
      await profileQ.upsert(userId, { notifyDiscoveryEmail: true })
    }
    try {
      const result = await sendDiscoveryEmailIfEnabled({
        userId,
        fallbackWindowMs: WEEK_MS,
      })
      return NextResponse.json({
        sent: result.sent,
        count: result.count,
        messageId: result.messageId,
        reason: result.reason,
      })
    } finally {
      if (!originalFlag) {
        await profileQ.upsert(userId, { notifyDiscoveryEmail: false })
      }
    }
  } catch (err) {
    if (err instanceof NoGoogleAccountError) {
      return NextResponse.json(
        { error: 'Reconnect your Google account to send discovery emails.' },
        { status: 400 },
      )
    }
    logger.error('discovery notification test send failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not send test email.' }, { status: 500 })
  }
}
