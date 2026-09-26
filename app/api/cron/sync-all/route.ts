import { type NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { runDiscoveryCycleForUser } from '@/lib/discovery/service'
import { getAIProviderForUser } from '@/lib/ai'
import { syncGmail } from '@/lib/gmail/sync'
import { NoGoogleAccountError } from '@/lib/google/tokens'
import * as profileQ from '@/lib/db/queries/profile'
import * as activitiesQ from '@/lib/db/queries/activities'
import {
  alreadySentThisTzWeek,
  isMondayInTz,
  sendWeeklyDigest,
} from '@/lib/digest/weekly'
import { alreadyNudgedRecently, findFollowupCandidates } from '@/lib/followups/service'
import { sendDiscoveryEmailIfEnabled } from '@/lib/notifications/discovery'
import { recordDueReminders } from '@/lib/reminders/service'
import { mapWithConcurrency } from '@/lib/util/concurrency'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Vercel Hobby with Fluid compute allows up to 300 s per invocation. The
// daily cron is the only long job, so it takes the full budget; discovery
// (the only unbounded step) gets its own time box below.
export const maxDuration = 300

/** Users processed at once — keeps Neon connections and AI rate limits calm. */
const USER_CONCURRENCY = 2
/** Wall-clock budget for the discovery phase across all users. */
const DISCOVERY_BUDGET_MS = 150_000
/** Discovery must stop starting new work this long before maxDuration. */
const DISCOVERY_HARD_STOP_MS = 240_000

type User = typeof users.$inferSelect

interface CycleTotals {
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
  errors: string[]
}

type UserTotals = Omit<CycleTotals, 'users' | 'reminders_added' | 'discovery_budget_exhausted'> & {
  discovery_budget_exhausted?: boolean
}

function emptyUserTotals(): UserTotals {
  return {
    sources_polled: 0,
    new_discoveries: 0,
    gmail_checked: 0,
    gmail_matched: 0,
    followups_recommended: 0,
    digests_sent: 0,
    discovery_emails_sent: 0,
    discovery_matches_notified: 0,
    errors: [],
  }
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Follow-ups, Gmail, digest — cheap, bounded per user. */
async function runCheapSteps(user: User): Promise<UserTotals> {
  const t = emptyUserTotals()

  // v4.2 — follow-up nudges. Emit a `followup_recommended` activity per
  // candidate so the dashboard "Needs attention" widget can surface them.
  // Idempotent: alreadyNudgedRecently prevents duplicate rows on re-runs.
  try {
    const candidates = await findFollowupCandidates(user.id)
    for (const c of candidates) {
      if (await alreadyNudgedRecently(user.id, c.applicationId)) continue
      await activitiesQ.log(user.id, c.applicationId, 'followup_recommended', {
        daysSince: c.daysSince,
        suggestedInterval: c.suggestedInterval,
      })
      t.followups_recommended += 1
    }
  } catch (e) {
    t.errors.push(`user ${user.id} followups: ${message(e)}`)
  }

  // Gmail — swallow NoGoogleAccountError (user hasn't connected yet).
  try {
    const gmail = await syncGmail({ userId: user.id })
    t.gmail_checked += gmail.checked
    t.gmail_matched += gmail.matched
  } catch (e) {
    if (!(e instanceof NoGoogleAccountError)) t.errors.push(`user ${user.id} gmail: ${message(e)}`)
  }

  // Weekly digest — Monday-local (per user timezone) only, guarded by
  // digestLastSentAt so an accidental re-run does not double-send.
  try {
    const profile = await profileQ.get(user.id)
    const tz = profile?.timezone
    if (profile?.weeklyDigestEnabled && isMondayInTz(tz) && !alreadySentThisTzWeek(profile, tz)) {
      await sendWeeklyDigest({ userId: user.id })
      t.digests_sent += 1
    }
  } catch (e) {
    if (!(e instanceof NoGoogleAccountError)) t.errors.push(`user ${user.id} digest: ${message(e)}`)
  }
  return t
}

/** Discovery (time-boxed) and the per-cycle discovery email that follows it. */
async function runDiscoverySteps(user: User, deadline: number): Promise<UserTotals> {
  const t = emptyUserTotals()
  if (Date.now() >= deadline) {
    t.discovery_budget_exhausted = true
    return t
  }
  // Never fatal — per-source errors are captured in the result.
  try {
    const ai = await getAIProviderForUser(user.id)
    const discovery = await runDiscoveryCycleForUser({ userId: user.id, ai, deadline })
    t.sources_polled += discovery.sourcesPolled
    t.new_discoveries += discovery.newJobDiscoveries + discovery.newCompanyDiscoveries
    t.discovery_budget_exhausted = discovery.budgetExhausted === true
    for (const err of discovery.errors) {
      t.errors.push(`user ${user.id} discovery src ${err.sourceId}: ${err.message}`)
    }
  } catch (e) {
    t.errors.push(`user ${user.id} discovery: ${message(e)}`)
  }

  // v6.2 discovery notification email — per-cycle, opt-in, after discovery
  // so freshly-ingested rows are considered. NoGoogleAccountError is
  // expected for users without a linked Gmail account.
  try {
    const notif = await sendDiscoveryEmailIfEnabled({ userId: user.id })
    if (notif.sent) {
      t.discovery_emails_sent += 1
      t.discovery_matches_notified += notif.count
    }
  } catch (e) {
    if (!(e instanceof NoGoogleAccountError)) t.errors.push(`user ${user.id} discovery_email: ${message(e)}`)
  }
  return t
}

function addUserTotals(total: CycleTotals, parts: readonly UserTotals[]): CycleTotals {
  return parts.reduce<CycleTotals>(
    (acc, p) => ({
      ...acc,
      sources_polled: acc.sources_polled + p.sources_polled,
      new_discoveries: acc.new_discoveries + p.new_discoveries,
      gmail_checked: acc.gmail_checked + p.gmail_checked,
      gmail_matched: acc.gmail_matched + p.gmail_matched,
      followups_recommended: acc.followups_recommended + p.followups_recommended,
      digests_sent: acc.digests_sent + p.digests_sent,
      discovery_emails_sent: acc.discovery_emails_sent + p.discovery_emails_sent,
      discovery_matches_notified: acc.discovery_matches_notified + p.discovery_matches_notified,
      discovery_budget_exhausted: acc.discovery_budget_exhausted || p.discovery_budget_exhausted === true,
      errors: [...acc.errors, ...p.errors],
    }),
    total,
  )
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization') ?? ''
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return new NextResponse('unauthorized', { status: 401 })
  }
  const startedAt = Date.now()
  const allUsers = await db.select().from(users)
  let totals: CycleTotals = {
    users: allUsers.length,
    sources_polled: 0,
    new_discoveries: 0,
    gmail_checked: 0,
    gmail_matched: 0,
    reminders_added: 0,
    followups_recommended: 0,
    digests_sent: 0,
    discovery_emails_sent: 0,
    discovery_matches_notified: 0,
    discovery_budget_exhausted: false,
    errors: [],
  }

  // 1. Reminders — one cross-user statement, at most one per app per day.
  try {
    totals = { ...totals, reminders_added: (await recordDueReminders()).inserted }
  } catch (e) {
    totals = { ...totals, errors: [...totals.errors, `reminders: ${message(e)}`] }
  }

  // 2. Cheap per-user steps: follow-ups, Gmail, digest.
  const cheap = await mapWithConcurrency(allUsers, USER_CONCURRENCY, runCheapSteps)
  totals = addUserTotals(totals, cheap)

  // 3. Discovery last, time-boxed so the whole run fits in maxDuration.
  const deadline = Math.min(Date.now() + DISCOVERY_BUDGET_MS, startedAt + DISCOVERY_HARD_STOP_MS)
  const discovery = await mapWithConcurrency(allUsers, USER_CONCURRENCY, (u) => runDiscoverySteps(u, deadline))
  totals = addUserTotals(totals, discovery)

  logger.info('cron_sync_all', {
    ...totals,
    error_count: totals.errors.length,
    duration_ms: Date.now() - startedAt,
  })
  return NextResponse.json(totals)
}
