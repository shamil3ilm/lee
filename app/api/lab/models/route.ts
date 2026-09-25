import { NextResponse } from 'next/server'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { badRequest, serverError, sessionUserId, unauthorized } from '@/lib/lab/http'
import { MissingKeyError, ProviderError, RateLimitedError } from '@/lib/lab/providers/errors'
import { listModels } from '@/lib/lab/providers/registry'
import { PROVIDER_IDS } from '@/lib/lab/providers/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const providerSchema = z.enum(PROVIDER_IDS)

/** GET /api/lab/models?provider=groq[&refresh=1] — live model list (cached ~3h). */
export async function GET(req: Request): Promise<Response> {
  try {
    const userId = await sessionUserId()
    if (!userId) return unauthorized()
    const params = new URL(req.url).searchParams
    const provider = providerSchema.safeParse(params.get('provider'))
    if (!provider.success) return badRequest('Unknown provider.')
    try {
      const models = await listModels(userId, provider.data, {
        refresh: params.get('refresh') === '1',
      })
      return NextResponse.json({ provider: provider.data, models })
    } catch (e) {
      if (e instanceof MissingKeyError) {
        return NextResponse.json({
          provider: provider.data,
          models: [],
          error: e.message,
          code: 'missing_key',
        })
      }
      if (e instanceof RateLimitedError) {
        return NextResponse.json({ error: e.message, code: 'rate_limited' }, { status: 429 })
      }
      if (e instanceof ProviderError) {
        return NextResponse.json({ error: e.message, code: e.code }, { status: 502 })
      }
      throw e
    }
  } catch (err) {
    logger.error('lab models GET failed', { err: err instanceof Error ? err.message : String(err) })
    return serverError('Could not load models.')
  }
}
