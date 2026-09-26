import { NextResponse } from 'next/server'
import { cronDrain, isCronAuthorized } from '@/lib/queue/cron'
import { scheduleDailyJobs } from '@/lib/queue/scheduler'
import { logger } from '@/lib/logger'

// Backwards-compatible alias (no longer scheduled; see vercel.json). The old
// monolithic cycle now runs as queue jobs: this enqueues today's jobs
// (idempotent per UTC day) and drains within the 240 s budget, then reports
// the legacy totals shape so existing callers and dashboards keep working.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

interface LegacyTotals {
  users: number
  sources_polled: number
  new_discoveries: number
  gmail_checked: number
  gmail_matched: number
  reminders_added: number
  followups_recommended: number
  digests_sent: number
  discovery_emails_sent: number
  discovery_matches_notified: number
  discovery_budget_exhausted: boolean
  jobs_enqueued: number
  jobs_done: number
  jobs_failed: number
  jobs_left: boolean
  errors: string[]
}

export async function GET(req: Request): Promise<NextResponse> {
  if (!isCronAuthorized(req)) return new NextResponse('unauthorized', { status: 401 })
  const startedAt = Date.now()
  const schedule = await scheduleDailyJobs(new Date())
  const r = await cronDrain()
  const m = (k: string): number => r.metrics[k] ?? 0
  const totals: LegacyTotals = {
    users: schedule.users,
    sources_polled: m('sources_polled'),
    new_discoveries: m('new_discoveries'),
    gmail_checked: m('gmail_checked'),
    gmail_matched: m('gmail_matched'),
    reminders_added: m('reminders_added'),
    followups_recommended: m('followups_recommended'),
    digests_sent: m('digests_sent'),
    discovery_emails_sent: m('discovery_emails_sent'),
    discovery_matches_notified: m('discovery_matches_notified'),
    discovery_budget_exhausted: m('discovery_budget_exhausted') > 0 || r.stoppedBy === 'budget',
    jobs_enqueued: schedule.enqueued,
    jobs_done: r.done,
    jobs_failed: r.failed + r.dead,
    jobs_left: r.stoppedBy !== 'empty',
    errors: r.errors,
  }
  logger.info('cron_sync_all', {
    ...totals,
    errors: undefined,
    error_count: totals.errors.length,
    duration_ms: Date.now() - startedAt,
  })
  return NextResponse.json(totals)
}
