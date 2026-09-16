import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import * as documentsQ from '@/lib/db/queries/documents'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

// GET returns the raw document JSON. DELETE removes the row. Both scope by
// the authenticated user so cross-tenant reads are impossible.
export async function GET(
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
    return NextResponse.json({ document: doc })
  } catch (err) {
    logger.error('GET /api/documents/[id] failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not load document.' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const { id } = await ctx.params
    const existing = await documentsQ.getById(userId, id)
    if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    await documentsQ.remove(userId, id)
    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error('DELETE /api/documents/[id] failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not delete document.' }, { status: 500 })
  }
}
