import { NextResponse } from 'next/server'
import { cronDrain, isCronAuthorized, summarizeDrain } from '@/lib/queue/cron'
import { scheduleDailyJobs } from '@/lib/queue/scheduler'
import { scheduleReputationRefresh } from '@/lib/reputation/schedule'
import { scheduleWhatsNew } from '@/lib/radar/new/schedule'
import { logger } from '@/lib/logger'

// Daily scheduler (vercel.json): enqueue the day's jobs — idempotent per UTC
// day — then drain what fits in the budget. The staggered /api/cron/drain
// runs pick up the rest (and retries) later in the day.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: Request): Promise<NextResponse> {
  if (!isCronAuthorized(req)) return new NextResponse('unauthorized', { status: 401 })
  try {
    const now = new Date()
    const schedule = await scheduleDailyJobs(now)
    // Weekly company reputation refreshes, spread over the week (bounded per day).
    const reputation = await scheduleReputationRefresh(now)
    // AI Radar What's new: one shared fetch per source for every account, due later in the day.
    const whatsNew = await scheduleWhatsNew(now)
    logger.info('cron_schedule', { ...schedule, reputationPlanned: reputation.planned, whatsNewPlanned: whatsNew.enqueued })
    const drained = await cronDrain()
    return NextResponse.json({ schedule, reputation, whatsNew, drain: summarizeDrain(drained) })
  } catch (err) {
    logger.error('cron_schedule_failed', { err: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: 'Scheduling failed.' }, { status: 500 })
  }
}
