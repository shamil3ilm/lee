import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import * as aiCallLogsQ from '@/lib/db/queries/aiCallLogs'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * v10 — POST /api/documents/[id]/rate
 *
 * Body: `{rating: 1|5}`
 *
 * Convenience route for the 👍/👎 buttons rendered under a document view.
 * Looks up the most recent successful ai_call_logs row for the document
 * and forwards the rating through the same query layer as the
 * /api/ai-calls route.
 */
const bodySchema = z.object({
  rating: z.union([z.literal(1), z.literal(5)]),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const { id: documentId } = await params

    const rawBody = (await req.json().catch(() => null)) as unknown
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid rating.' }, { status: 400 })
    }
    const { rating } = parsed.data

    const call = await aiCallLogsQ.findLatestByDocument(userId, documentId)
    if (!call) {
      return NextResponse.json(
        { error: 'No AI call log linked to this document — cannot rate.' },
        { status: 404 },
      )
    }
    const updated = await aiCallLogsQ.updateRating(userId, call.id, rating)
    if (!updated) {
      return NextResponse.json({ error: 'Failed to persist rating.' }, { status: 500 })
    }
    return NextResponse.json({
      success: true,
      callId: updated.id,
      rating: updated.userRating,
    })
  } catch (err) {
    logger.error('rate_document_failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not rate document.' }, { status: 500 })
  }
}
