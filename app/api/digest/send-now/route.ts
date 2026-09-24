import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sendWeeklyDigest } from '@/lib/digest/weekly'
import { NoGoogleAccountError } from '@/lib/google/tokens'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * Ad-hoc digest send — bypasses the Monday + same-week guards so users can
 * verify the email arrives correctly from /settings/notifications. Still
 * updates digestLastSentAt so a real send later in the week is suppressed
 * (users who click test-send on a Monday should not get a duplicate cron
 * send at 08:00).
 */
export async function POST(): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const result = await sendWeeklyDigest({ userId })
    return NextResponse.json({
      messageId: result.messageId,
      apps: result.snapshot.totalApplications,
      interviews: result.snapshot.upcomingInterviews.length,
    })
  } catch (err) {
    if (err instanceof NoGoogleAccountError) {
      return NextResponse.json(
        { error: 'Reconnect your Google account to send digests.' },
        { status: 400 },
      )
    }
    logger.error('digest send-now failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not send digest.' }, { status: 500 })
  }
}
