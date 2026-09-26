import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { generateCoverLetter } from '@/lib/documents/coverLetter'
import { getAIProviderForUser } from '@/lib/ai'
import { AISkippedError } from '@/lib/ai/signal'
import { AiUsageScope } from '@/lib/ai/usage'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // Collects the AI calls made for this response → `usage` in the JSON.
  const aiUsage = new AiUsageScope()
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    aiUsage.bindUser(userId)
    const { id: applicationId } = await params
    const ai = await getAIProviderForUser(userId)
    const doc = await aiUsage.run(() => generateCoverLetter({ userId, applicationId, ai }))
    return NextResponse.json({
      documentId: doc.id,
      downloadUrl: `/api/documents/${doc.id}/pdf`,
      usage: aiUsage.usage,
    })
  } catch (err) {
    if (err instanceof AISkippedError) {
      return NextResponse.json(
        {
          skipped: true,
          code: err.code,
          message: err.message,
          fixHint: err.fixHint,
          usage: aiUsage.usage,
        },
        { status: 200 },
      )
    }
    logger.error('generate-cover-letter failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not generate cover letter.' }, { status: 500 })
  }
}
