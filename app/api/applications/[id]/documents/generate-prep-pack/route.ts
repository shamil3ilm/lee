import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { generateInterviewPrepPack } from '@/lib/documents/prep'
import {
  ApplicationNotFoundError,
  MasterCVNotFoundError,
} from '@/lib/documents/errors'
import { getAIProviderForUser } from '@/lib/ai'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const bodySchema = z.object({
  stageKind: z.string().min(1),
  stageId: z.string().uuid().optional(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const { id: applicationId } = await params
    const rawBody = (await req.json().catch(() => null)) as unknown
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }
    const ai = await getAIProviderForUser(userId)
    const doc = await generateInterviewPrepPack({
      userId,
      applicationId,
      stageKind: parsed.data.stageKind,
      stageId: parsed.data.stageId,
      ai,
    })
    return NextResponse.json({
      documentId: doc.id,
      downloadUrl: `/api/documents/${doc.id}/pdf`,
    })
  } catch (err) {
    if (err instanceof MasterCVNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    if (err instanceof ApplicationNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    logger.error('generate-prep-pack failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not generate prep pack.' }, { status: 500 })
  }
}
