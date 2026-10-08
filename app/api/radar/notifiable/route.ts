import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { radarLinesFor } from '@/lib/radar/notify'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * GET /api/radar/notifiable?since=<iso>
 *
 * The browser poller's radar channel (components/notification-scheduler.tsx):
 * new watch-term matches seen after `since`, only when Settings ›
 * Notifications › AI Radar is "Instant". Disabled → an empty list, never an
 * error. `since` is clamped to the last 7 days.
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const now = Date.now()
    const raw = new Date(new URL(req.url).searchParams.get('since') ?? '')
    const since = Number.isNaN(raw.getTime()) ? now - DAY_MS : Math.max(now - 7 * DAY_MS, Math.min(raw.getTime(), now))
    const lines = await radarLinesFor(userId, 'browser', { since: new Date(since), now: new Date(now) })
    return NextResponse.json({
      entries: lines.map((l) => ({ id: l.id, name: l.name, terms: l.terms, lastSeenAt: l.lastSeenAt.toISOString() })),
    })
  } catch (err) {
    logger.error('radar notifiable failed', { err: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: 'Could not load radar updates.' }, { status: 500 })
  }
}
