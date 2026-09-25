import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { serverError, sessionUserId, unauthorized } from '@/lib/lab/http'
import { getProviderStatuses } from '@/lib/lab/status'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/lab/providers[?check=1]
 * Catalogue + masked key state (`last4` only) + optional live reachability.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const userId = await sessionUserId()
    if (!userId) return unauthorized()
    const check = new URL(req.url).searchParams.get('check') === '1'
    const providers = await getProviderStatuses(userId, { check })
    return NextResponse.json({ providers })
  } catch (err) {
    logger.error('lab providers GET failed', { err: err instanceof Error ? err.message : String(err) })
    return serverError('Could not load providers.')
  }
}
