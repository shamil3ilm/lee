import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { CLIENT_ERRORS_PER_MINUTE, MAX_CLIENT_ERROR_BYTES, clientErrorSchema } from '@/lib/errors/client-report'
import { createRateLimiter } from '@/lib/vitals/rate-limit'
import { toRoutePattern } from '@/lib/vitals/route-pattern'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const limiter = createRateLimiter({ limit: CLIENT_ERRORS_PER_MINUTE, windowMs: 60_000 })

function status(code: number): NextResponse {
  return new NextResponse(null, { status: code })
}

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
 * POST /api/client-errors — an error boundary's report (app/error.tsx,
 * app/(authed)/error.tsx, app/global-error.tsx). The screen itself shows
 * only a friendly message and the digest; the detail is logged here, where
 * it lands in Settings › Logs. Signed-in, same-origin, small and rate-limited.
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return status(401)
    if (!isSameOrigin(req)) return status(403)
    if (!limiter.take(userId)) return status(429)

    const declared = Number(req.headers.get('content-length') ?? 0)
    if (declared > MAX_CLIENT_ERROR_BYTES) return status(413)
    const text = await req.text()
    if (text.length > MAX_CLIENT_ERROR_BYTES) return status(413)

    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      return status(400)
    }
    const parsed = clientErrorSchema.safeParse(body)
    if (!parsed.success) return status(400)
    const { digest, message, route, boundary } = parsed.data
    logger.error('client_render_error', {
      userId,
      boundary,
      // Route pattern, not the raw URL: ids and query strings stay out of the logs.
      route: toRoutePattern(route),
      code: digest,
      err: message,
    })
    return status(204)
  } catch (err) {
    logger.error('client_error_report_failed', { err: err instanceof Error ? err.message : String(err) })
    return status(500)
  }
}
