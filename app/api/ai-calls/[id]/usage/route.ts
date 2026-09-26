import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import * as aiCallLogsQ from '@/lib/db/queries/aiCallLogs'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const idSchema = z.string().uuid()

/**
 * v18 — GET /api/ai-calls/[id]/usage → `{usage}` for one of the user's AI
 * calls (tokens, model, latency — no content). Used by the usage badge on
 * results produced earlier, e.g. discovery match reasoning. Another user's
 * call is a 404.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const { id } = await params
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid id.' }, { status: 400 })
    }
    const usage = await aiCallLogsQ.getUsage(userId, id)
    if (!usage) return NextResponse.json({ error: 'AI call not found.' }, { status: 404 })
    return NextResponse.json({ usage })
  } catch (err) {
    logger.error('ai_call_usage_failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not load AI usage.' }, { status: 500 })
  }
}
