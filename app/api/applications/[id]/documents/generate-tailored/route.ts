import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { generateTailoredCV } from '@/lib/documents/tailor'
import { getAIProviderForUser } from '@/lib/ai'
import { AISkippedError } from '@/lib/ai/signal'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const { id: applicationId } = await params
    const ai = await getAIProviderForUser(userId)
    const doc = await generateTailoredCV({ userId, applicationId, ai })
    return NextResponse.json({
      documentId: doc.id,
      downloadUrl: `/api/documents/${doc.id}/pdf`,
    })
  } catch (err) {
    if (err instanceof AISkippedError) {
      // Signal-check refusal — HTTP 200 so the client treats it as a
      // "handled skip" rather than a failure. Client shows the fixHint.
      return NextResponse.json(
        { skipped: true, code: err.code, message: err.message, fixHint: err.fixHint },
        { status: 200 },
      )
    }
    logger.error('generate-tailored failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not generate tailored CV.' }, { status: 500 })
  }
}
