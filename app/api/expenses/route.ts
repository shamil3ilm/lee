import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import * as expensesQ from '@/lib/db/queries/expenses'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  amountCents: z.number().int(),
  currency: z.string().min(3).max(6).optional(),
  category: z
    .string()
    .refine((v) => expensesQ.isExpenseCategory(v), 'unknown category'),
  subcategory: z.string().optional().nullable(),
  vendor: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  recurring: z.boolean().optional(),
  recurringPeriod: z.enum(['monthly', 'annual']).optional().nullable(),
})

/**
 * GET /api/expenses[?month=YYYY-MM]
 * Returns the caller's expenses, optionally scoped to a calendar month.
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

    const url = new URL(req.url)
    const month = url.searchParams.get('month')
    if (month && !monthPattern.test(month)) {
      return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
    }
    const expenses = month
      ? await expensesQ.listMonth(userId, month)
      : await expensesQ.list(userId)
    return NextResponse.json({ expenses })
  } catch (err) {
    logger.error('GET /api/expenses failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not load expenses.' }, { status: 500 })
  }
}

/**
 * POST /api/expenses — create a single expense. Body validated with zod;
 * bad shapes get a 400 with a friendly message (no zod internals leaked).
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
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request body.' },
        { status: 400 },
      )
    }
    const row = await expensesQ.create(userId, {
      date: parsed.data.date,
      amountCents: parsed.data.amountCents,
      currency: parsed.data.currency ?? 'AED',
      category: parsed.data.category,
      subcategory: parsed.data.subcategory ?? null,
      vendor: parsed.data.vendor ?? null,
      description: parsed.data.description ?? null,
      recurring: parsed.data.recurring ?? false,
      recurringPeriod: parsed.data.recurringPeriod ?? null,
    })
    return NextResponse.json({ expense: row }, { status: 201 })
  } catch (err) {
    logger.error('POST /api/expenses failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not create expense.' }, { status: 500 })
  }
}
