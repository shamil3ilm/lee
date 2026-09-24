import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { syncFromGithub } from '@/lib/documents/master'
import { getAIProviderForUser } from '@/lib/ai'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const schema = z.object({ username: z.string().min(1).max(100) })

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const body = await req.json()
    const { username } = schema.parse(body)
    const ai = await getAIProviderForUser(userId)
    const { proposed } = await syncFromGithub({ userId, username, ai })
    return NextResponse.json({ proposed })
  } catch (err) {
    logger.error('github sync failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not sync from GitHub.' }, { status: 500 })
  }
}
