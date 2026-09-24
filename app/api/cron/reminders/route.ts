import { type NextRequest, NextResponse } from 'next/server'
import { and, lte, notInArray, isNotNull } from 'drizzle-orm'
import { env } from '@/lib/env'
import { db } from '@/lib/db/client'
import { applications, activities } from '@/lib/db/schema'
import { logger } from '@/lib/logger'

// NOTE (v3): this endpoint is NO LONGER scheduled by vercel.json — the daily
// cron now hits `/api/cron/sync-all`, which fans out to discovery + gmail +
// reminders. This route is retained as a callable endpoint for manual runs
// and one-off debugging.

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new NextResponse('unauthorized', { status: 401 })
  }

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

  logger.info('cron_reminders', { checked: due.length, reminders_added: due.length })
  return NextResponse.json({ checked: due.length, reminders_added: due.length })
}
