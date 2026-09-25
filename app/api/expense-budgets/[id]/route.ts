import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import * as budgetsQ from '@/lib/db/queries/expenseBudgets'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const { id } = await ctx.params
    const existing = await budgetsQ.getById(userId, id)
    if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    await budgetsQ.remove(userId, id)
    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error('DELETE /api/expense-budgets/[id] failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not delete budget.' }, { status: 500 })
  }
}
