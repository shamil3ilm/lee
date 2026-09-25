import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { saveQuickDebrief, StageNotFoundError } from '@/lib/documents/debrief'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

const bodySchema = z.object({
  notesMd: z.string().max(20_000),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const { id: stageId } = await params
    const rawBody = (await req.json().catch(() => null)) as unknown
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }
    await saveQuickDebrief({ userId, stageId, notesMd: parsed.data.notesMd })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof StageNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    logger.error('save_quick_debrief_failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not save debrief notes.' }, { status: 500 })
  }
}
