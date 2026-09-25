import { NextResponse } from 'next/server'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { parseJson, serverError, sessionUserId, unauthorized } from '@/lib/lab/http'
import { checkReachable } from '@/lib/lab/status'
import { PROVIDER_IDS } from '@/lib/lab/providers/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const schema = z.object({ provider: z.enum(PROVIDER_IDS) })

/** POST /api/lab/providers/test — { provider } → { ok, error } using the resolved key. */
export async function POST(req: Request): Promise<Response> {
  try {
    const userId = await sessionUserId()
    if (!userId) return unauthorized()
    const parsed = await parseJson(req, schema)
    if (!parsed.ok) return parsed.response
    const r = await checkReachable(userId, parsed.data.provider)
    return NextResponse.json(r)
  } catch (err) {
    logger.error('lab provider test failed', { err: err instanceof Error ? err.message : String(err) })
    return serverError('Could not test the connection.')
  }
}
