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
import {
  alreadySentThisWeek,
  isMondayUtc,
  sendWeeklyDigest,
} from '@/lib/digest/weekly'
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
  digests_sent: number
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
    digests_sent: 0,
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

    // Weekly digest — Monday only, guarded by digestLastSentAt so an
    // accidental re-run does not double-send. Same NoGoogleAccountError
    // silently-skipped pattern as Gmail sync.
    if (isMondayUtc()) {
      try {
        const profile = await profileQ.get(user.id)
        if (profile?.weeklyDigestEnabled && !alreadySentThisWeek(profile)) {
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
