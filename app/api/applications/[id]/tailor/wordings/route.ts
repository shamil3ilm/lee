import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAIProviderForUser } from '@/lib/ai'
import { AiUsageScope } from '@/lib/ai/usage'
import { AISkippedError } from '@/lib/ai/signal'
import { proposeAiWordings, TailorError } from '@/lib/cv-fit/tailor/service'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST — "Tailor to this JD": optional AI wordings of the bullets that back
 * met requirements, in the JD's terms. Signal-gated (a 200 skip with a fix
 * hint when there is nothing to reword) and locked in code: numbers must be
 * in the master highlight, design-only items never claim implementation.
 * Nothing is saved; the user accepts each wording, and Save stores it.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const aiUsage = new AiUsageScope()
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    aiUsage.bindUser(userId)
    const { id } = await params
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
    const r = await aiUsage.run(async () => proposeAiWordings(userId, id, await getAIProviderForUser(userId)))
    return NextResponse.json({ suggestions: r.suggestions, rejected: r.rejected, usage: aiUsage.usage })
  } catch (err) {
    if (err instanceof AISkippedError) {
      return NextResponse.json({ skipped: true, code: err.code, message: err.message, fixHint: err.fixHint, usage: aiUsage.usage })
    }
    if (err instanceof TailorError) return NextResponse.json({ error: err.message }, { status: err.code === 'not_found' ? 404 : 400 })
    logger.error('tailor_wordings failed', { err: err instanceof Error ? err.message : String(err) })
    // A missing key is the common case: say so (our own message), never provider text.
    const noKey = err instanceof Error && /^No (Gemini|Groq) key/.test(err.message)
    return NextResponse.json({ error: noKey ? err.message : 'Could not suggest new wordings.' }, { status: noKey ? 400 : 500 })
  }
}
