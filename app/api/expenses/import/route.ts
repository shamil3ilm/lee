import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import * as expensesQ from '@/lib/db/queries/expenses'
import { parseExpenseCsv } from '@/lib/expenses/csv'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const bodySchema = z.object({
  csv: z.string().min(1),
})

/**
 * POST /api/expenses/import
 * Body: { csv: string }
 * Returns { inserted: number, errors: [{line, message}] }.
 * Partial success: valid rows are always inserted, invalid rows are
 * surfaced in `errors` so the UI can show them without discarding the batch.
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'csv (string) is required.' }, { status: 400 })
    }
    const { rows, errors } = parseExpenseCsv(parsed.data.csv)
    const inserted = await expensesQ.createMany(userId, rows)
    return NextResponse.json({ inserted: inserted.length, errors })
  } catch (err) {
    logger.error('POST /api/expenses/import failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not import expenses.' }, { status: 500 })
  }
}
