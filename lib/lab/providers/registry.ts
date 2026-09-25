import * as keysQ from '@/lib/db/queries/labProviderKeys'
import { getProviderInfo, OPENROUTER_APP_HEADERS } from './catalog'
import { MissingKeyError, ProviderError } from './errors'
import { parseModelList } from './models'
import { chat, fetchModels, type ChatOptions, type Endpoint } from './openai-compatible'
import type { ChatRequest, ChatResult, KeySource, ModelInfo, ProviderId } from './types'

/**
 * v14 — SERVER-ONLY provider registry: key resolution, endpoint building,
 * live model lists (cached), and chat dispatch. Never import from a client
 * component — it reaches decrypted keys.
 */

export { PROVIDERS, getProviderInfo } from './catalog'

const MODEL_CACHE_TTL_MS = 3 * 60 * 60 * 1000

interface CacheEntry {
  at: number
  models: ModelInfo[]
}
const modelCache = new Map<string, CacheEntry>()

export function _clearModelCache(): void {
  modelCache.clear()
}

export interface ResolvedKey {
  key: string | null
  source: KeySource
}

/** DB key (decrypted) → env fallback → none. */
export async function resolveKey(userId: string, provider: ProviderId): Promise<ResolvedKey> {
  const info = getProviderInfo(provider)
  if (!info.needsKey) return { key: null, source: 'none' }
  const stored = await keysQ.getDecrypted(userId, provider)
  if (stored) return { key: stored, source: 'db' }
  const envName = info.envKey
  const envVal = envName ? process.env[envName] : undefined
  if (envVal) return { key: envVal, source: 'env' }
  return { key: null, source: 'none' }
}

export function buildEndpoint(provider: ProviderId, apiKey: string | null): Endpoint {
  const info = getProviderInfo(provider)
  if (info.runsIn !== 'server' || info.comingSoon || !info.baseUrl) {
    throw new ProviderError(`${info.label} runs in the browser and is not available yet.`, {
      code: 'bad_request',
    })
  }
  const extraHeaders: Record<string, string> =
    provider === 'openrouter'
      ? {
          ...OPENROUTER_APP_HEADERS,
          'HTTP-Referer': process.env.NEXTAUTH_URL ?? 'http://localhost:3000',
        }
      : {}
  return { provider, baseUrl: info.baseUrl, apiKey: apiKey ?? undefined, extraHeaders }
}

async function endpointFor(userId: string, provider: ProviderId): Promise<Endpoint> {
  const info = getProviderInfo(provider)
  const { key } = await resolveKey(userId, provider)
  if (info.needsKey && !key) throw new MissingKeyError(info.label)
  return buildEndpoint(provider, key)
}

export async function listModels(
  userId: string,
  provider: ProviderId,
  opts: { fetchImpl?: typeof fetch; now?: number; refresh?: boolean } = {},
): Promise<ModelInfo[]> {
  const info = getProviderInfo(provider)
  if (info.runsIn !== 'server' || info.comingSoon) return []
  const cacheKey = `${userId}:${provider}`
  const now = opts.now ?? Date.now()
  const hit = modelCache.get(cacheKey)
  if (!opts.refresh && hit && now - hit.at < MODEL_CACHE_TTL_MS) return hit.models
  const ep = await endpointFor(userId, provider)
  const json = await fetchModels(ep, { fetchImpl: opts.fetchImpl })
  const models = parseModelList(provider, json)
  modelCache.set(cacheKey, { at: now, models })
  return models
}

/** Invalidate cached model lists for a user+provider (e.g. after a key change). */
export function invalidateModels(userId: string, provider: ProviderId): void {
  modelCache.delete(`${userId}:${provider}`)
}

/**
 * Cheap key check: call `/models` with the candidate key. Resolves on
 * success, throws a ProviderError (auth / rate-limit / network) otherwise.
 */
export async function validateKey(
  provider: ProviderId,
  key: string,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<void> {
  await fetchModels(buildEndpoint(provider, key), { fetchImpl: opts.fetchImpl })
}

export async function callModel(
  userId: string,
  provider: ProviderId,
  model: string,
  req: ChatRequest,
  opts: ChatOptions = {},
): Promise<ChatResult> {
  const ep = await endpointFor(userId, provider)
  return chat(ep, model, req, opts)
}
