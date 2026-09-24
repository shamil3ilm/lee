import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { deleteStageEvent } from '@/lib/calendar/service'
import { NoGoogleAccountError } from '@/lib/google/tokens'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    }
    const { id: stageId } = await params
    await deleteStageEvent({ userId, stageId })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof NoGoogleAccountError) {
      return NextResponse.json(
        { error: 'Google Calendar not connected.' },
        { status: 400 },
      )
    }
    logger.error('remove_from_calendar_failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not remove event from calendar.' }, { status: 500 })
  }
}
