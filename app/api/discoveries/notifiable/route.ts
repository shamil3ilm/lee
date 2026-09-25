import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { findNotifiableDiscoveries } from '@/lib/notifications/discovery'
import * as profileQ from '@/lib/db/queries/profile'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * GET /api/discoveries/notifiable?since=<iso>
 *
 * Client-side poller endpoint for the NotificationScheduler. Returns
 * discoveries with `status='new'` and `matchScore >= profile.notifyDiscoveryMinScore`
 * created after `since`. Respects the per-user opt-out
 * (`notifyDiscoveryBrowser`) — returns an empty array (never 4xx) when
 * disabled so the poller can keep running silently.
 *
 * `since` defaults to 24h ago if omitted or unparseable. Capped at 30 days
 * back to bound the query.
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

    const profile = await profileQ.get(userId)
    if (!profile?.notifyDiscoveryBrowser) {
      // Feature toggled off — return empty list, not an error. The poller
      // should silently no-op without surfacing a red badge.
      return NextResponse.json({ discoveries: [], disabled: true })
    }

    const url = new URL(req.url)
    const sinceParam = url.searchParams.get('since')
    const now = Date.now()
    let sinceIso: string
    if (sinceParam) {
      const parsed = new Date(sinceParam)
      if (Number.isNaN(parsed.getTime())) {
        sinceIso = new Date(now - DAY_MS).toISOString()
      } else {
        // Clamp: never more than 30 days back, never in the future.
        const clamped = Math.max(now - 30 * DAY_MS, Math.min(parsed.getTime(), now))
        sinceIso = new Date(clamped).toISOString()
      }
    } else {
      sinceIso = new Date(now - DAY_MS).toISOString()
    }

    const items = await findNotifiableDiscoveries(
      userId,
      profile.notifyDiscoveryMinScore,
      sinceIso,
    )
    return NextResponse.json({
      discoveries: items.map((d) => ({
        id: d.id,
        title: d.title,
        companyName: d.companyName,
        matchScore: d.matchScore,
        createdAt: d.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    logger.error('GET /api/discoveries/notifiable failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not load discoveries.' }, { status: 500 })
  }
}
