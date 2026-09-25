import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buildCsv, isExportMetric } from '@/lib/analytics/csv'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * GET /api/analytics/export/[metric]
 *
 * Dispatches to the matching service function, converts the result to CSV,
 * and returns it as a `text/csv` attachment. Unknown metrics 404 — do NOT
 * echo the input into the error body (it hits the URL path).
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ metric: string }> },
): Promise<Response> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    }

    const { metric } = await ctx.params
    if (!isExportMetric(metric)) {
      return NextResponse.json({ error: 'Unknown analytics metric.' }, { status: 404 })
    }

    const csv = await buildCsv(metric, userId)
    const filename = `employ-${metric}-${new Date().toISOString().slice(0, 10)}.csv`
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    logger.error('GET /api/analytics/export/[metric] failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not export analytics.' }, { status: 500 })
  }
}
