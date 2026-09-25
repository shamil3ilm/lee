import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { search } from '@/lib/search/service'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Global command-menu search. POST body: { q: string }. Returns 5 hits per
 * resource kind (applications, companies, contacts, discoveries) scoped to
 * the calling user. Empty query → empty result. Errors are logged
 * server-side and surfaced to the client as a generic 500 message.
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    }
    const raw = (await req.json().catch(() => ({}))) as { q?: unknown }
    const q = typeof raw.q === 'string' ? raw.q : ''
    const results = await search(userId, q)
    return NextResponse.json(results)
  } catch (err) {
    logger.error('search failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Search failed.' }, { status: 500 })
  }
}
