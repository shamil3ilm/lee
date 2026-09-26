import { NextResponse } from 'next/server'
import { z } from 'zod'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { cronDrain, CRON_DRAIN_BUDGET_MS, summarizeDrain } from '@/lib/queue/cron'
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifyQueueRequest } from '@/lib/queue/signature'

// Signed worker endpoint for GitHub Actions (.github/workflows/queue-drain.yml)
// — the hook for heavy work that outgrows Vercel Hobby. Disabled unless
// QUEUE_WORKER_SECRET is set. Auth: HMAC-SHA256 over `${timestamp}.${body}`
// with a ±5 min skew window, compared in constant time. A replay inside the
// window only triggers another drain, which is idempotent by design.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_BODY_BYTES = 2_048

const bodySchema = z
  .object({
    budgetMs: z.number().int().min(1_000).max(CRON_DRAIN_BUDGET_MS).optional(),
    maxJobs: z.number().int().min(1).max(500).optional(),
    types: z.array(z.string().min(1).max(64)).max(20).optional(),
  })
  .strict()

export async function POST(req: Request): Promise<NextResponse> {
  const secret = env.QUEUE_WORKER_SECRET
  if (!secret) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const body = await req.text()
  if (body.length > MAX_BODY_BYTES) return NextResponse.json({ error: 'Body too large.' }, { status: 413 })
  const verified = verifyQueueRequest({
    secret,
    timestamp: req.headers.get(TIMESTAMP_HEADER),
    signature: req.headers.get(SIGNATURE_HEADER),
    body,
  })
  if (!verified.ok) {
    logger.warn('queue_worker_rejected', { reason: verified.reason })
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  let parsed: z.infer<typeof bodySchema>
  try {
    const json: unknown = body.trim() === '' ? {} : JSON.parse(body)
    const result = bodySchema.safeParse(json)
    if (!result.success) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })
    parsed = result.data
  } catch {
    return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })
  }

  try {
    const drained = await cronDrain({
      ...(parsed.budgetMs ? { budgetMs: parsed.budgetMs } : {}),
      ...(parsed.maxJobs ? { maxJobs: parsed.maxJobs } : {}),
      ...(parsed.types ? { types: parsed.types } : {}),
      workerId: `gha-${crypto.randomUUID()}`,
    })
    return NextResponse.json(summarizeDrain(drained))
  } catch (err) {
    logger.error('queue_worker_drain_failed', { err: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: 'Drain failed.' }, { status: 500 })
  }
}
