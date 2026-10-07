import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAIProviderForUser } from '@/lib/ai'
import { AiUsageScope } from '@/lib/ai/usage'
import { coverStep } from '@/lib/apply/prepare'
import { prepareStepError } from '@/lib/apply/http'
import { parseLinkIds } from '@/lib/profile/shared-links'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/** POST { linkIds } — Prepare step 3: the cover letter with the ticked profile links. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const aiUsage = new AiUsageScope()
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    aiUsage.bindUser(userId)
    const { id: applicationId } = await params
    const linkIds = parseLinkIds(await req.json().catch(() => null))
    const ai = await getAIProviderForUser(userId)
    const r = await aiUsage.run(() => coverStep(userId, applicationId, ai, linkIds))
    return NextResponse.json({ documentId: r.documentId, usage: aiUsage.usage })
  } catch (err) {
    return prepareStepError(err, 'prepare_cover', 'Could not draft the cover letter.', aiUsage.usage)
  }
}
