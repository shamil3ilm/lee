import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import * as documentsQ from '@/lib/db/queries/documents'
import * as activitiesQ from '@/lib/db/queries/activities'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 10

/**
 * POST /api/documents/[id]/acknowledge-stale
 *   → 200 { success: true }
 *
 * Records an audit trail when a user chooses "Copy anyway" on a critical
 * stale banner — the banner closes and we log a `stale_action_taken`
 * activity so we can see later that the copy happened despite the warning.
 * No side effects beyond the activity row; the actual copy is client-side.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const { id } = await ctx.params
    const doc = await documentsQ.getById(userId, id)
    if (!doc) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    // Only application-scoped docs have an activity home; master/latex docs
    // just skip the audit log rather than fail.
    if (doc.applicationId) {
      await activitiesQ.log(userId, doc.applicationId, 'stale_action_taken', {
        documentId: doc.id,
        kind: doc.kind,
      })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error('POST /api/documents/[id]/acknowledge-stale failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not record acknowledgement.' }, { status: 500 })
  }
}
