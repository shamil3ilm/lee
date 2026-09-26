import { type NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { runDiscoveryCycleForUser } from '@/lib/discovery/service'
import { getAIProviderForUser } from '@/lib/ai'
import { logger } from '@/lib/logger'

// NOTE (v3): this endpoint is NO LONGER scheduled by vercel.json — the daily
// cron now hits `/api/cron/sync-all`, which fans out to discovery + gmail +
// reminders. This route is retained as a callable endpoint for manual runs
// and one-off debugging.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Vercel Hobby with Fluid compute allows up to 300 s; discovery is
// time-boxed below so the run always returns inside it.
export const maxDuration = 300
/** Wall-clock budget for discovery across all users. */
const DISCOVERY_BUDGET_MS = 240_000

interface CycleTotals {
  users: number
  sources_polled: number
  new_discoveries: number
  errors: string[]
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new NextResponse('unauthorized', { status: 401 })
  }

  const allUsers = await db.select().from(users)
  const totals: CycleTotals = {
    users: 0,
    sources_polled: 0,
    new_discoveries: 0,
    errors: [],
  }

  const deadline = Date.now() + DISCOVERY_BUDGET_MS
  for (const user of allUsers) {
    try {
      const ai = await getAIProviderForUser(user.id)
      const result = await runDiscoveryCycleForUser({ userId: user.id, ai, deadline })
      totals.users += 1
      totals.sources_polled += result.sourcesPolled
      totals.new_discoveries += result.newJobDiscoveries + result.newCompanyDiscoveries
      for (const err of result.errors) {
        totals.errors.push(`user ${user.id} src ${err.sourceId}: ${err.message}`)
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      totals.errors.push(`user ${user.id}: ${message}`)
    }
  }

  logger.info('cron_discover', { ...totals, error_count: totals.errors.length })
  return NextResponse.json(totals)
}
