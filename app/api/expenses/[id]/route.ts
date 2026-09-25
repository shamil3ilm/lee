import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import * as expensesQ from '@/lib/db/queries/expenses'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const patchSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
      .optional(),
    amountCents: z.number().int().optional(),
    currency: z.string().min(3).max(6).optional(),
    category: z
      .string()
      .refine((v) => expensesQ.isExpenseCategory(v), 'unknown category')
      .optional(),
    subcategory: z.string().optional().nullable(),
    vendor: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    recurring: z.boolean().optional(),
    recurringPeriod: z.enum(['monthly', 'annual']).optional().nullable(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'no fields to update' })

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const { id } = await ctx.params
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request body.' },
        { status: 400 },
      )
    }
    const row = await expensesQ.update(userId, id, parsed.data)
    if (!row) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    return NextResponse.json({ expense: row })
  } catch (err) {
    logger.error('PATCH /api/expenses/[id] failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not update expense.' }, { status: 500 })
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
    const existing = await expensesQ.getById(userId, id)
    if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    await expensesQ.remove(userId, id)
    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error('DELETE /api/expenses/[id] failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not delete expense.' }, { status: 500 })
  }
}
