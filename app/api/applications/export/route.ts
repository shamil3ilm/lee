import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import * as appsQ from '@/lib/db/queries/applications'
import { applicationsToCsv, csvFilename } from '@/lib/applications/csv'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/applications/export → text/csv of every application for the
 * caller. Streams the whole set in one response; user application counts
 * stay well under any browser-friendly size limit even for heavy users.
 */
export async function GET(): Promise<Response> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const rows = await appsQ.list(userId, {})
    const csv = applicationsToCsv(rows)
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${csvFilename()}"`,
        'cache-control': 'no-store',
      },
    })
  } catch (err) {
    logger.error('applications export failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not export applications.' }, { status: 500 })
  }
}
