import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import * as aiCallLogsQ from '@/lib/db/queries/aiCallLogs'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * v10 — POST /api/documents/[id]/action
 *
 * Body: `{action: 'used'|'regenerated'|'dismissed'}`
 *
 * Records an implicit-signal action on the most recent ai_call_logs row
 * linked to the document. Fire-and-forget from the client; a 404 here
 * (no linked call) is a soft failure the caller ignores.
 */
const bodySchema = z.object({
  action: z.enum(['used', 'regenerated', 'dismissed']),
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
      return NextResponse.json({ error: 'Invalid action.' }, { status: 400 })
    }

    const call = await aiCallLogsQ.findLatestByDocument(userId, documentId)
    if (!call) {
      return NextResponse.json(
        { error: 'No AI call log linked to this document.' },
        { status: 404 },
      )
    }
    const updated = await aiCallLogsQ.updateAction(userId, call.id, parsed.data.action)
    if (!updated) {
      return NextResponse.json({ error: 'Failed to persist action.' }, { status: 500 })
    }
    return NextResponse.json({ success: true, action: updated.userAction })
  } catch (err) {
    logger.error('document_action_failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not record action.' }, { status: 500 })
  }
}
