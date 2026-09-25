import { NextResponse } from 'next/server'
import { z } from 'zod'
import * as runsQ from '@/lib/db/queries/labRuns'
import { logger } from '@/lib/logger'
import { notFound, parseJson, serverError, sessionUserId, unauthorized } from '@/lib/lab/http'
import { toRunView } from '@/lib/lab/views'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const schema = z.object({ resultId: z.string().uuid() })
const runIdSchema = z.string().uuid()

/**
 * POST /api/lab/arena/[runId]/vote — { resultId }
 * Marks the winner and returns the run with model identities revealed.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ runId: string }> },
): Promise<Response> {
  try {
    const userId = await sessionUserId()
    if (!userId) return unauthorized()
    const { runId } = await ctx.params
    if (!runIdSchema.safeParse(runId).success) return notFound('Run not found.')
    const parsed = await parseJson(req, schema)
    if (!parsed.ok) return parsed.response
    const results = await runsQ.recordVote(userId, runId, parsed.data.resultId)
    if (!results) return notFound('Run or result not found.')
    const run = await runsQ.getRun(userId, runId)
    if (!run) return notFound('Run not found.')
    return NextResponse.json({ run: toRunView(run, results) })
  } catch (err) {
    logger.error('arena vote failed', { err: err instanceof Error ? err.message : String(err) })
    return serverError('Could not record the vote.')
  }
}
