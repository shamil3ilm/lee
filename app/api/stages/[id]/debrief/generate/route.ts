import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  EmptyDebriefNotesError,
  StageNotFoundError,
  generateAIDebrief,
} from '@/lib/documents/debrief'
import {
  ApplicationNotFoundError,
  MasterCVNotFoundError,
} from '@/lib/documents/errors'
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
    const { id: stageId } = await params
    const ai = await getAIProviderForUser(userId)
    const doc = await generateAIDebrief({ userId, stageId, ai })
    return NextResponse.json({
      documentId: doc.id,
      downloadUrl: `/api/documents/${doc.id}/pdf`,
    })
  } catch (err) {
    if (err instanceof StageNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    if (err instanceof EmptyDebriefNotesError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    if (err instanceof MasterCVNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    if (err instanceof ApplicationNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    logger.error('generate_ai_debrief_failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not generate debrief.' }, { status: 500 })
  }
}
