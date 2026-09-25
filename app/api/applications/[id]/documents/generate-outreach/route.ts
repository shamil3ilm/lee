import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { generateOutreachDraft } from '@/lib/documents/outreach'
import {
  outreachKindSchema,
  outreachToneSchema,
} from '@/lib/documents/types'
import {
  ApplicationNotFoundError,
  MasterCVNotFoundError,
} from '@/lib/documents/errors'
import { getAIProviderForUser } from '@/lib/ai'
import { AISkippedError } from '@/lib/ai/signal'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const bodySchema = z.object({
  kind: outreachKindSchema,
  tone: outreachToneSchema,
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
    const doc = await generateOutreachDraft({
      userId,
      applicationId,
      kind: parsed.data.kind,
      tone: parsed.data.tone,
      ai,
    })
    return NextResponse.json({
      documentId: doc.id,
      downloadUrl: `/api/documents/${doc.id}/pdf`,
    })
  } catch (err) {
    if (err instanceof AISkippedError) {
      return NextResponse.json(
        { skipped: true, code: err.code, message: err.message, fixHint: err.fixHint },
        { status: 200 },
      )
    }
    if (err instanceof MasterCVNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    if (err instanceof ApplicationNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    logger.error('generate-outreach failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not generate outreach draft.' }, { status: 500 })
  }
}
