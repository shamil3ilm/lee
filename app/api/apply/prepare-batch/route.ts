import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { getAIProviderForUser } from '@/lib/ai'
import { AiUsageScope } from '@/lib/ai/usage'
import { prepareBatch } from '@/lib/apply/batch'
import { MAX_BATCH } from '@/lib/apply/batch-limits'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/** Leave room for the response inside maxDuration. */
const BUDGET_MS = 50_000

const bodySchema = z.object({
  discoveryIds: z.array(z.string().uuid()).min(1).max(MAX_BATCH),
})

/**
 * POST /api/apply/prepare-batch — prepare up to three shortlisted postings
 * (application, suggested variant, tailored CV, cover letter). Drafts only:
 * nothing is sent or submitted.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const aiUsage = new AiUsageScope()
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: `Pick between 1 and ${MAX_BATCH} postings.` }, { status: 400 })
    }
    aiUsage.bindUser(userId)
    const ai = await getAIProviderForUser(userId)
    const items = await aiUsage.run(() =>
      prepareBatch(userId, parsed.data.discoveryIds, { ai, deadline: Date.now() + BUDGET_MS }),
    )
    revalidatePath('/shortlist')
    revalidatePath('/')
    revalidatePath('/applications')
    return NextResponse.json({ items, usage: aiUsage.usage })
  } catch (err) {
    logger.error('prepare-batch failed', { err: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: 'Could not prepare these applications.' }, { status: 500 })
  }
}
