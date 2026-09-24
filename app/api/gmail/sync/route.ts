import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { syncGmail } from '@/lib/gmail/sync'
import { NoGoogleAccountError } from '@/lib/google/tokens'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    }
    const result = await syncGmail({ userId })
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    if (err instanceof NoGoogleAccountError) {
      return NextResponse.json(
        { error: 'Google account not connected. Sign out and sign in to grant Gmail access.' },
        { status: 400 },
      )
    }
    logger.error('gmail_sync_route_failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not sync Gmail.' }, { status: 500 })
  }
}
