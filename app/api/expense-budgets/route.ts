import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import * as budgetsQ from '@/lib/db/queries/expenseBudgets'
import * as expensesQ from '@/lib/db/queries/expenses'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const upsertSchema = z.object({
  category: z
    .string()
    .refine((v) => expensesQ.isExpenseCategory(v), 'unknown category'),
  monthlyCapCents: z.number().int().min(0),
  currency: z.string().min(3).max(6).optional(),
})

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const budgets = await budgetsQ.list(userId)
    return NextResponse.json({ budgets })
  } catch (err) {
    logger.error('GET /api/expense-budgets failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not load budgets.' }, { status: 500 })
  }
}

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
    const parsed = upsertSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request body.' },
        { status: 400 },
      )
    }
    const row = await budgetsQ.upsert(userId, parsed.data)
    return NextResponse.json({ budget: row })
  } catch (err) {
    logger.error('POST /api/expense-budgets failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not save budget.' }, { status: 500 })
  }
}
