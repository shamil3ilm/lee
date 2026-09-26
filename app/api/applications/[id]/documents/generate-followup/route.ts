import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { generateOutreachDraft } from '@/lib/documents/outreach'
import { outreachToneSchema } from '@/lib/documents/types'
import {
  ApplicationNotFoundError,
  MasterCVNotFoundError,
} from '@/lib/documents/errors'
import { getAIProviderForUser } from '@/lib/ai'
import { AISkippedError } from '@/lib/ai/signal'
import { AiUsageScope } from '@/lib/ai/usage'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

// Both tone and daysSince are optional so the client can fire "quick action"
// buttons with just an interval, or omit both and let the server default
// tone=friendly and compute daysSince from appliedAt.
const bodySchema = z.object({
  tone: outreachToneSchema.optional(),
  // Only the four canonical intervals are useful — anything else means a
  // programmer error client-side.
  daysSince: z.union([z.literal(7), z.literal(14), z.literal(21), z.literal(30)]).optional(),
})

export async function POST(
  req: Request,
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
    const rawBody = (await req.json().catch(() => ({}))) as unknown
    const parsed = bodySchema.safeParse(rawBody ?? {})
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }
    const ai = await getAIProviderForUser(userId)
    const doc = await aiUsage.run(() => generateOutreachDraft({
      userId,
      applicationId,
      kind: 'followup_email',
      tone: parsed.data.tone ?? 'friendly',
      daysSince: parsed.data.daysSince,
      ai,
    }))
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
    if (err instanceof MasterCVNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    if (err instanceof ApplicationNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    logger.error('generate-followup failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not generate follow-up draft.' }, { status: 500 })
  }
}
