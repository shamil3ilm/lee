import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getDriveConnection, usesDrive } from '@/lib/drive/connection'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/drive/status → { hasGoogleAccount, connected, enabled, backend }
 * Cheap (two indexed reads, no Google call); drives the "Connect Google
 * Drive" / "Attach from Drive" UI. Never returns tokens.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const conn = await getDriveConnection(userId)
    return NextResponse.json(
      { ...conn, backend: usesDrive(conn) ? 'drive' : 'postgres' },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (err) {
    logger.error('GET /api/drive/status failed', { err: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: 'Could not check Google Drive.' }, { status: 500 })
  }
}
