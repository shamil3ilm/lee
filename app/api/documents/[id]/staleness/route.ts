import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { checkDocumentStaleness } from '@/lib/staleness/check'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

/**
 * GET /api/documents/[id]/staleness
 *   → 200 { severity, changedFields, summary, currentSnapshot, previousSnapshot }
 *   → 401 when not signed in
 *   → 404 when the document does not exist for this user
 *
 * Called by the UI (banner + badge) to decide whether to nudge the user to
 * regenerate before they consume the doc. See lib/staleness/check.ts for the
 * per-kind severity rules.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

    const { id } = await ctx.params
    const result = await checkDocumentStaleness(userId, id)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.toLowerCase().includes('not found')) {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    }
    logger.error('GET /api/documents/[id]/staleness failed', { err: message })
    return NextResponse.json({ error: 'Could not check staleness.' }, { status: 500 })
  }
}
