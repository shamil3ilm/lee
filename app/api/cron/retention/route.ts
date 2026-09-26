import { type NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { runRetention } from '@/lib/db/retention'
import { logger } from '@/lib/logger'

// Daily storage retention (Neon Free = 0.5 GB). Scheduled in vercel.json at
// a different hour from the queue scheduler and drains so they never overlap.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new NextResponse('unauthorized', { status: 401 })
  }
  try {
    const result = await runRetention(new Date())
    logger.info('cron_retention', { ...result })
    return NextResponse.json(result)
  } catch (err) {
    logger.error('cron_retention_failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Retention failed.' }, { status: 500 })
  }
}
