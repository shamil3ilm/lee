import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import * as aiCallLogsQ from '@/lib/db/queries/aiCallLogs'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * v10 — POST /api/ai-calls/[id]/rate
 *
 * Body: `{rating?: 1|5, action?: 'used'|'regenerated'|'dismissed'}`
 *
 * Persists an explicit thumbs (rating) and/or an implicit action signal on
 * the underlying ai_call_logs row. Ownership enforced by the query layer —
 * a rating targeted at another user's call is a silent 404.
 */
const bodySchema = z
  .object({
    rating: z.union([z.literal(1), z.literal(5)]).optional(),
    action: z.enum(['used', 'regenerated', 'dismissed']).optional(),
  })
  .refine((v) => v.rating !== undefined || v.action !== undefined, {
    message: 'Provide rating or action.',
  })

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const { id } = await params

    const rawBody = (await req.json().catch(() => null)) as unknown
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request body.' },
        { status: 400 },
      )
    }
    const { rating, action } = parsed.data

    // Explicit rating first; then action so both can be recorded in one POST.
    let row = rating !== undefined
      ? await aiCallLogsQ.updateRating(userId, id, rating, action)
      : null
    if (rating === undefined && action !== undefined) {
      row = await aiCallLogsQ.updateAction(userId, id, action)
    }
    if (!row) {
      return NextResponse.json({ error: 'AI call not found.' }, { status: 404 })
    }
    return NextResponse.json({
      success: true,
      id: row.id,
      rating: row.userRating,
      action: row.userAction,
    })
  } catch (err) {
    logger.error('rate_ai_call_failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not rate AI call.' }, { status: 500 })
  }
}
