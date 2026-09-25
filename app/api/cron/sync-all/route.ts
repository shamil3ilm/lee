import { type NextRequest, NextResponse } from 'next/server'
import { and, isNotNull, lte, notInArray } from 'drizzle-orm'
import { env } from '@/lib/env'
import { db } from '@/lib/db/client'
import { activities, applications, users } from '@/lib/db/schema'
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
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Vercel Hobby caps at 60s. Discovery is the heaviest step; with a small
// number of users this fits comfortably. Multi-user deployments should be on
// Pro (300s cap) or should split into per-user schedules.
export const maxDuration = 60

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
  errors: string[]
}

async function processReminders(): Promise<number> {
  const due = await db
    .select()
    .from(applications)
    .where(
      and(
        isNotNull(applications.nextActionAt),
        lte(applications.nextActionAt, new Date()),
        notInArray(applications.status, ['rejected', 'withdrawn']),
      ),
    )
  for (const a of due) {
    await db.insert(activities).values({
      userId: a.userId,
      applicationId: a.id,
      kind: 'reminder',
      payload: { reason: 'next_action_at reached' },
    })
  }
  return due.length
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization') ?? ''
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return new NextResponse('unauthorized', { status: 401 })
  }

  const allUsers = await db.select().from(users)
  const totals: CycleTotals = {
    users: 0,
    sources_polled: 0,
    new_discoveries: 0,
    gmail_checked: 0,
    gmail_matched: 0,
    reminders_added: 0,
    followups_recommended: 0,
    digests_sent: 0,
    discovery_emails_sent: 0,
    discovery_matches_notified: 0,
    errors: [],
  }

  for (const user of allUsers) {
    totals.users += 1

    // Discovery — never fatal, per-source errors are captured in the result.
    try {
      const ai = await getAIProviderForUser(user.id)
      const discovery = await runDiscoveryCycleForUser({ userId: user.id, ai })
      totals.sources_polled += discovery.sourcesPolled
      totals.new_discoveries += discovery.newJobDiscoveries + discovery.newCompanyDiscoveries
      for (const err of discovery.errors) {
        totals.errors.push(`user ${user.id} discovery src ${err.sourceId}: ${err.message}`)
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      totals.errors.push(`user ${user.id} discovery: ${message}`)
    }

    // v6.2 discovery notification email — per-cycle, opt-in. Runs after the
    // discovery cycle so freshly-ingested rows are considered. Independent of
    // the Monday-only weekly digest; a user can opt into either, both, or
    // neither. NoGoogleAccountError is expected for users without a linked
    // Gmail account and is swallowed silently.
    try {
      const notif = await sendDiscoveryEmailIfEnabled({ userId: user.id })
      if (notif.sent) {
        totals.discovery_emails_sent += 1
        totals.discovery_matches_notified += notif.count
      }
    } catch (e) {
      if (e instanceof NoGoogleAccountError) {
        // Expected: no Gmail scope → cannot send. Skip silently.
      } else {
        const message = e instanceof Error ? e.message : String(e)
        totals.errors.push(`user ${user.id} discovery_email: ${message}`)
      }
    }

    // Gmail — swallow NoGoogleAccountError (user hasn't connected yet).
    try {
      const gmail = await syncGmail({ userId: user.id })
      totals.gmail_checked += gmail.checked
      totals.gmail_matched += gmail.matched
    } catch (e) {
      if (e instanceof NoGoogleAccountError) {
        // Expected: user has not connected Google. Skip silently.
      } else {
        const message = e instanceof Error ? e.message : String(e)
        totals.errors.push(`user ${user.id} gmail: ${message}`)
      }
    }

    // Weekly digest — Monday-local (per user timezone) only, guarded by
    // digestLastSentAt so an accidental re-run does not double-send. Same
    // NoGoogleAccountError silently-skipped pattern as Gmail sync.
    try {
      const profile = await profileQ.get(user.id)
      const tz = profile?.timezone
      if (
        profile?.weeklyDigestEnabled &&
        isMondayInTz(tz) &&
        !alreadySentThisTzWeek(profile, tz)
      ) {
        await sendWeeklyDigest({ userId: user.id })
        totals.digests_sent += 1
      }
    } catch (e) {
      if (e instanceof NoGoogleAccountError) {
        // Expected: no Gmail scope → cannot send. Skip silently.
      } else {
        const message = e instanceof Error ? e.message : String(e)
        totals.errors.push(`user ${user.id} digest: ${message}`)
      }
    }

    // v4.2 — follow-up nudges. Emit a `followup_recommended` activity per
    // candidate so the dashboard "Needs attention" widget can surface them.
    // Idempotent: alreadyNudgedRecently prevents duplicate rows on re-runs
    // within the same day (cron runs multiple times per day).
    try {
      const candidates = await findFollowupCandidates(user.id)
      for (const c of candidates) {
        if (await alreadyNudgedRecently(user.id, c.applicationId)) continue
        await activitiesQ.log(user.id, c.applicationId, 'followup_recommended', {
          daysSince: c.daysSince,
          suggestedInterval: c.suggestedInterval,
        })
        totals.followups_recommended += 1
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      totals.errors.push(`user ${user.id} followups: ${message}`)
    }
  }

  // Reminders — cross-user single sweep; cheap even at high volumes.
  try {
    totals.reminders_added = await processReminders()
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    totals.errors.push(`reminders: ${message}`)
  }

  logger.info('cron_sync_all', { ...totals, error_count: totals.errors.length })
  return NextResponse.json(totals)
}
