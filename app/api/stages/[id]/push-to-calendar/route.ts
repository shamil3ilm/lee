import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db/client'
import { interviewStages } from '@/lib/db/schema'
import { pushStageToCalendar } from '@/lib/calendar/service'
import { NoGoogleAccountError } from '@/lib/google/tokens'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

// v9 execution guard: the client posts what it thought the stage state was
// when the user clicked; the server rejects with 409 if the record has
// drifted (event already exists, or scheduledAt moved by more than 6 hours).
const SIX_HOURS_MS = 6 * 60 * 60 * 1000

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    }
    const { id: stageId } = await params

    // Body is optional — legacy clients (or fresh page loads) call this
    // without expected values, in which case we skip the drift check.
    let expectedGoogleEventId: string | null | undefined
    let expectedScheduledAt: string | null | undefined
    try {
      const body = (await req.json().catch(() => null)) as
        | { expectedGoogleEventId?: string | null; expectedScheduledAt?: string | null }
        | null
      if (body && typeof body === 'object') {
        expectedGoogleEventId = body.expectedGoogleEventId
        expectedScheduledAt = body.expectedScheduledAt
      }
    } catch {
      /* body optional */
    }

    if (expectedGoogleEventId !== undefined || expectedScheduledAt !== undefined) {
      const current = await db.query.interviewStages.findFirst({
        where: and(eq(interviewStages.userId, userId), eq(interviewStages.id, stageId)),
      })
      if (!current) {
        return NextResponse.json({ error: 'Stage not found.' }, { status: 404 })
      }
      // The client expected the stage NOT to have an event yet, but by now
      // one was created (parallel tab / earlier push). Refuse rather than
      // create a duplicate or overwrite.
      if (
        expectedGoogleEventId !== undefined &&
        (expectedGoogleEventId ?? null) !== (current.googleEventId ?? null)
      ) {
        return NextResponse.json(
          {
            conflict: 'stage_event_drift',
            message: current.googleEventId
              ? 'This stage was already pushed to Calendar since you opened the page.'
              : 'Stage state changed since you opened the page.',
          },
          { status: 409 },
        )
      }
      if (
        expectedScheduledAt !== undefined &&
        expectedScheduledAt !== null &&
        current.scheduledAt
      ) {
        const expectedMs = new Date(expectedScheduledAt).getTime()
        const currentMs = current.scheduledAt.getTime()
        if (Math.abs(currentMs - expectedMs) > SIX_HOURS_MS) {
          return NextResponse.json(
            {
              conflict: 'stage_reschedule_drift',
              message:
                'Stage was rescheduled more than 6 hours since you opened the page. Refresh and try again.',
            },
            { status: 409 },
          )
        }
      }
    }

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
