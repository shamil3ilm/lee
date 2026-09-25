import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import * as expensesQ from '@/lib/db/queries/expenses'
import { expensesToCsv } from '@/lib/expenses/csv'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const rows = await expensesQ.list(userId)
    const csv = expensesToCsv(rows)
    const filename = `employ-expenses-${new Date().toISOString().slice(0, 10)}.csv`
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    })
  } catch (err) {
    logger.error('GET /api/expenses/export failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not export expenses.' }, { status: 500 })
  }
}
