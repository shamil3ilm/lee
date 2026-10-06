import * as keysQ from '@/lib/db/queries/labProviderKeys'
import { PROVIDERS } from './providers/catalog'
import { safeErrorMessage } from './providers/errors'
import { classifyLabError, friendlyLabError } from './friendly-error'
import { logger } from '@/lib/logger'
import { buildEndpoint, resolveKey } from './providers/registry'
import { fetchModels } from './providers/openai-compatible'
import type { KeySource, ProviderId, ProviderInfo } from './providers/types'

/**
 * v14 — per-provider status for the Lab hub / Providers page. Contains only
 * masked key info (last4). Reachability is checked on demand because it costs
 * one `/models` request per provider.
 */

export interface ProviderStatus {
  info: ProviderInfo
  keySource: KeySource
  last4: string | null
  keyUpdatedAt: string | null
  reachable: boolean | null
  reachError: string | null
}

export async function checkReachable(
  userId: string,
  provider: ProviderId,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const { key } = await resolveKey(userId, provider)
    if (!key) return { ok: false, error: 'No key configured.' }
    await fetchModels(buildEndpoint(provider, key), { fetchImpl: opts.fetchImpl, timeoutMs: 8_000 })
    return { ok: true, error: null }
  } catch (e) {
    // Friendly text for the Providers page; the raw message goes to the log.
    logger.warn('lab_provider_unreachable', { provider, err: safeErrorMessage(e) })
    return { ok: false, error: friendlyLabError(classifyLabError(e), provider).message }
  }
}

export async function getProviderStatuses(
  userId: string,
  opts: { check?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<ProviderStatus[]> {
  const masked = await keysQ.listMasked(userId)
  const byProvider = new Map(masked.map((m) => [m.provider, m]))
  return Promise.all(
    PROVIDERS.map(async (info) => {
      const m = byProvider.get(info.id)
      const keySource: KeySource = m
        ? 'db'
        : info.envKey && process.env[info.envKey]
          ? 'env'
          : 'none'
      let reachable: boolean | null = null
      let reachError: string | null = null
      if (opts.check && info.runsIn === 'server' && !info.comingSoon && keySource !== 'none') {
        const r = await checkReachable(userId, info.id, opts)
        reachable = r.ok
        reachError = r.error
      }
      return {
        info,
        keySource,
        last4: m?.last4 ?? null,
        keyUpdatedAt: m?.updatedAt ? m.updatedAt.toISOString() : null,
        reachable,
        reachError,
      }
    }),
  )
}
