import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getDecisionProviderForUser } from '@/lib/decisions'
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@/lib/expenses/categories'
import { checkExpenseClassifySignal } from '@/lib/ai/signal'
import { writeSkipLog } from '@/lib/ai/log'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// v10 — dropped the `.refine(...)` here so the "both fields empty" case is
// handled by the signal-check gate below (returns HTTP 200 with a skip
// envelope rather than a 400). This keeps the "refused" semantics consistent
// with the other generator routes.
const bodySchema = z.object({
  description: z.string().max(500).optional(),
  vendor: z.string().max(200).optional(),
  subcategory: z.string().max(200).optional(),
})

/**
 * POST /api/expenses/classify
 * Body: `{description?, vendor?}`. Returns `{category, confidence}` using
 * the configured decision provider. Never surfaces an upstream error — the
 * composed provider always falls back to the heuristic layer.
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
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request body.' },
        { status: 400 },
      )
    }
    const { description, vendor } = parsed.data
    const signal = checkExpenseClassifySignal(description, vendor)
    if (!signal.ok) {
      await writeSkipLog(
        { userId, provider: 'unknown', kind: 'expense_classify' },
        signal.code,
      )
      return NextResponse.json(
        {
          skipped: true,
          code: signal.code,
          message: signal.message,
          fixHint: signal.fixHint,
        },
        { status: 200 },
      )
    }
    const text = [vendor, description].filter(Boolean).join(' — ')

    const provider = await getDecisionProviderForUser(userId)
    const result = await provider.choice<ExpenseCategory>({
      text,
      options: EXPENSE_CATEGORIES,
      context:
        'You are classifying a personal expense into a single category. ' +
        'The vendor is the merchant name; the description is a short note.',
    })

    return NextResponse.json({
      category: result.pick,
      confidence: result.confidence,
    })
  } catch (err) {
    logger.error('POST /api/expenses/classify failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: 'Could not classify expense.' },
      { status: 500 },
    )
  }
}
