import { NextResponse } from 'next/server'
import { z } from 'zod'
import * as keysQ from '@/lib/db/queries/labProviderKeys'
import { logger } from '@/lib/logger'
import { badRequest, parseJson, serverError, sessionUserId, unauthorized } from '@/lib/lab/http'
import { getProviderInfo } from '@/lib/lab/providers/catalog'
import { ProviderError, RateLimitedError } from '@/lib/lab/providers/errors'
import { invalidateModels, validateKey } from '@/lib/lab/providers/registry'
import { PROVIDER_IDS } from '@/lib/lab/providers/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const saveSchema = z.object({
  provider: z.enum(PROVIDER_IDS),
  key: z
    .string()
    .trim()
    .min(8, 'Key looks too short')
    .max(512, 'Key looks too long')
    .regex(/^\S+$/, 'Key must not contain spaces'),
})

const providerOnly = z.object({ provider: z.enum(PROVIDER_IDS) })

/**
 * POST /api/lab/providers/keys — { provider, key }
 * Validates the key with a cheap `/models` call, then stores it encrypted.
 * Responds with `{ ok, last4 }` — the key itself is never echoed.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const userId = await sessionUserId()
    if (!userId) return unauthorized()
    const parsed = await parseJson(req, saveSchema)
    if (!parsed.ok) return parsed.response
    const { provider, key } = parsed.data
    const info = getProviderInfo(provider)
    if (!info.needsKey || info.runsIn !== 'server') {
      return badRequest(`${info.label} does not use an API key.`)
    }
    try {
      await validateKey(provider, key)
    } catch (e) {
      // A rate-limited validation still proves the key authenticates.
      if (!(e instanceof RateLimitedError)) {
        const msg =
          e instanceof ProviderError && e.code === 'auth'
            ? `${info.label} rejected this key.`
            : e instanceof ProviderError
              ? `Could not verify the key: ${e.message}`
              : 'Could not verify the key.'
        return badRequest(msg)
      }
    }
    const saved = await keysQ.upsert(userId, provider, key)
    invalidateModels(userId, provider)
    return NextResponse.json({ ok: true, provider, last4: saved.last4 })
  } catch (err) {
    logger.error('lab key save failed', { err: err instanceof Error ? err.message : String(err) })
    return serverError('Could not save the key.')
  }
}

/** DELETE /api/lab/providers/keys — { provider } body, or ?provider= */
export async function DELETE(req: Request): Promise<Response> {
  try {
    const userId = await sessionUserId()
    if (!userId) return unauthorized()
    const fromQuery = new URL(req.url).searchParams.get('provider')
    let candidate: unknown = fromQuery
    if (!fromQuery) {
      const parsed = await parseJson(req, providerOnly)
      if (!parsed.ok) return parsed.response
      candidate = parsed.data.provider
    }
    const check = providerOnly.safeParse({ provider: candidate })
    if (!check.success) return badRequest('Unknown provider.')
    const removed = await keysQ.remove(userId, check.data.provider)
    invalidateModels(userId, check.data.provider)
    return NextResponse.json({ ok: true, removed })
  } catch (err) {
    logger.error('lab key delete failed', { err: err instanceof Error ? err.message : String(err) })
    return serverError('Could not remove the key.')
  }
}
