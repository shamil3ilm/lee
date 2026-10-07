import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAIProviderForUser } from '@/lib/ai'
import { AiUsageScope } from '@/lib/ai/usage'
import { tailorStep } from '@/lib/apply/prepare'
import { prepareStepError } from '@/lib/apply/http'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * POST — Prepare step 2: the tailored CV from the chosen variant (the
 * existing fact-locked pipeline) and its CV Score delta vs the variant.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const aiUsage = new AiUsageScope()
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    aiUsage.bindUser(userId)
    const { id: applicationId } = await params
    const ai = await getAIProviderForUser(userId)
    const r = await aiUsage.run(() => tailorStep(userId, applicationId, ai))
    return NextResponse.json({
      documentId: r.documentId,
      scoreBefore: r.scoreBefore,
      scoreAfter: r.scoreAfter,
      usage: aiUsage.usage,
    })
  } catch (err) {
    return prepareStepError(err, 'prepare_tailor', 'Could not tailor the CV.', aiUsage.usage)
  }
}
