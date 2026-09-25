import { NextResponse } from 'next/server'
import * as runsQ from '@/lib/db/queries/labRuns'
import { logger } from '@/lib/logger'
import { serverError, sessionUserId, unauthorized } from '@/lib/lab/http'
import { summarizeRun } from '@/lib/lab/run-summary'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** GET /api/lab/runs[?limit=20] — the user's recent Lab runs. */
export async function GET(req: Request): Promise<Response> {
  try {
    const userId = await sessionUserId()
    if (!userId) return unauthorized()
    const limitRaw = Number(new URL(req.url).searchParams.get('limit') ?? 20)
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 100) : 20
    const runs = await runsQ.listRuns(userId, limit)
    return NextResponse.json({ runs: runs.map(summarizeRun) })
  } catch (err) {
    logger.error('lab runs GET failed', { err: err instanceof Error ? err.message : String(err) })
    return serverError('Could not load runs.')
  }
}
