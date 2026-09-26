import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getDriveConnection } from '@/lib/drive/connection'
import { DriveError, driveErrorResponse, toDriveError } from '@/lib/drive/errors'
import { DRIVE_FILE_SCOPE } from '@/lib/drive/scope'
import { mintScopedAccessToken } from '@/lib/google/tokens'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/drive/picker-token → { accessToken, expiresIn }
 *
 * The Google Picker runs in the browser and needs an OAuth token. We mint a
 * fresh one narrowed to drive.file only (never the stored token, which also
 * carries Gmail/Calendar scopes), valid for about an hour and never
 * persisted. The refresh token never leaves the server.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const conn = await getDriveConnection(userId)
    if (!conn.connected) return driveErrorResponse(new DriveError('not_connected'))
    const token = await mintScopedAccessToken(userId, DRIVE_FILE_SCOPE)
    return NextResponse.json(token, { headers: { 'cache-control': 'no-store' } })
  } catch (err) {
    const de = toDriveError(err)
    logger.warn('drive_picker_token_failed', {
      code: de.code,
      err: err instanceof Error ? err.message : String(err),
    })
    return driveErrorResponse(de)
  }
}
