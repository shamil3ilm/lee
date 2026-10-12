import { type NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/queue/cron'
import { recordDueReminders } from '@/lib/reminders/service'
import { logger } from '@/lib/logger'

// NOTE: this endpoint is NOT scheduled by vercel.json — reminders run as the
// `reminders:all` queue job (lib/queue, enqueued by /api/cron/schedule).
// This route is retained as a callable endpoint for manual runs and one-off
// debugging. It shares the sweep with the job, so running both on the same
// day still writes at most one reminder per application.

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isCronAuthorized(req)) return new NextResponse('unauthorized', { status: 401 })

  const { due, inserted } = await recordDueReminders()
  logger.info('cron_reminders', { checked: due, reminders_added: inserted })
  return NextResponse.json({ checked: due, reminders_added: inserted })
}
