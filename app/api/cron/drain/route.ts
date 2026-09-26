import { NextResponse } from 'next/server'
import { cronDrain, isCronAuthorized, summarizeDrain } from '@/lib/queue/cron'
import { logger } from '@/lib/logger'

// Staggered daily drains (vercel.json lists this path several times with
// different hours — Hobby allows one run per day per entry). Each run
// drains due jobs — leftovers from the scheduler's run and retries whose
// backoff has passed — within the 240 s budget. Parallel or duplicate
// deliveries are safe: claims use FOR UPDATE SKIP LOCKED.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: Request): Promise<NextResponse> {
  if (!isCronAuthorized(req)) return new NextResponse('unauthorized', { status: 401 })
  try {
    const drained = await cronDrain()
    return NextResponse.json(summarizeDrain(drained))
  } catch (err) {
    logger.error('cron_drain_failed', { err: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: 'Drain failed.' }, { status: 500 })
  }
}
