import { NextResponse } from 'next/server'
import { z } from 'zod'
import * as runsQ from '@/lib/db/queries/labRuns'
import { logger } from '@/lib/logger'
import { notFound, serverError, sessionUserId, unauthorized } from '@/lib/lab/http'
import { toRunView } from '@/lib/lab/views'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const idSchema = z.string().uuid()

/** GET /api/lab/runs/[id] — one run with results (identities hidden until a blind vote). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const userId = await sessionUserId()
    if (!userId) return unauthorized()
    const { id } = await ctx.params
    if (!idSchema.safeParse(id).success) return notFound('Run not found.')
    const found = await runsQ.getRunWithResults(userId, id)
    if (!found) return notFound('Run not found.')
    return NextResponse.json({ run: toRunView(found.run, found.results) })
  } catch (err) {
    logger.error('lab run GET failed', { err: err instanceof Error ? err.message : String(err) })
    return serverError('Could not load the run.')
  }
}
