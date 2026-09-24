import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { pushStageToCalendar } from '@/lib/calendar/service'
import { NoGoogleAccountError } from '@/lib/google/tokens'
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
    if (!userId) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    }
    const { id: stageId } = await params
    const { eventId } = await pushStageToCalendar({ userId, stageId })
    return NextResponse.json({ success: true, eventId })
  } catch (err) {
    if (err instanceof NoGoogleAccountError) {
      return NextResponse.json(
        { error: 'Google Calendar not connected. Sign out and sign in to grant access.' },
        { status: 400 },
      )
    }
    logger.error('push_to_calendar_failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not push stage to calendar.' }, { status: 500 })
  }
}
