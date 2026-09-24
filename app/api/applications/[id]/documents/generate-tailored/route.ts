import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { generateTailoredCV } from '@/lib/documents/tailor'
import { getAIProviderForUser } from '@/lib/ai'
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
    logger.error('generate-tailored failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not generate tailored CV.' }, { status: 500 })
  }
}
