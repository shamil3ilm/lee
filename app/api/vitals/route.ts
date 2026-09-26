import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { recordBeacon } from '@/lib/db/queries/webVitals'
import { logger } from '@/lib/logger'
import { beaconSchema, MAX_BEACON_BYTES } from '@/lib/vitals/beacon'
import { createRateLimiter, VITALS_BEACONS_PER_MINUTE } from '@/lib/vitals/rate-limit'
import { toRoutePattern } from '@/lib/vitals/route-pattern'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const limiter = createRateLimiter({ limit: VITALS_BEACONS_PER_MINUTE, windowMs: 60_000 })

function status(code: number): NextResponse {
  return new NextResponse(null, { status: code })
}

/** Browsers send Origin on POST; a cross-site one is refused (belt and braces over SameSite=Lax). */
function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).host === new URL(req.url).host
  } catch {
    return false
  }
}

/**
 * POST /api/vitals — one page load's web vitals, sent with
 * navigator.sendBeacon by components/web-vitals-reporter.tsx. Folded into the
 * day's per-route aggregates (web_vitals_daily); nothing raw is stored.
 * Responds 204 with no body; a beacon's response is never read.
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return status(401)
    if (!isSameOrigin(req)) return status(403)
    if (!limiter.take(userId)) return status(429)

    const declared = Number(req.headers.get('content-length') ?? 0)
    if (declared > MAX_BEACON_BYTES) return status(413)
    const text = await req.text()
    if (text.length > MAX_BEACON_BYTES) return status(413)

    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      return status(400)
    }
    const parsed = beaconSchema.safeParse(body)
    if (!parsed.success) return status(400)
    // Re-normalize server side so a crafted beacon can't store a raw URL.
    const beacon = { ...parsed.data, route: toRoutePattern(parsed.data.route) }

    const day = new Date().toISOString().slice(0, 10)
    await recordBeacon(userId, day, beacon)
    return status(204)
  } catch (err) {
    logger.error('vitals.record_failed', { err: err instanceof Error ? err.message : String(err) })
    return status(500)
  }
}
