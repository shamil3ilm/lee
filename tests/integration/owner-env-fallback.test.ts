import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/lib/db/client'
import { usageSettings } from '@/lib/db/schema'
import * as keysQ from '@/lib/db/queries/labProviderKeys'
import { resolveKey } from '@/lib/lab/providers/registry'
import { getProviderStatuses } from '@/lib/lab/status'
import { listServiceSecretStatuses, resolveAiKey, resolveServiceSecret } from '@/lib/settings/secrets'
import { SERVICE_SECRETS } from '@/lib/settings/service-secrets'
import { AdzunaAdapter } from '@/lib/discovery/adapters/adzuna'
import { resolveDecisionKeys } from '@/lib/decisions/index'
import { resolveNeonCredentials } from '@/lib/usage/snapshot'
import { getAIProviderForUser } from '@/lib/ai'
import { makeUser } from '@/tests/factories'

/**
 * Invite-beta audit §1.3 (T2): the server's env keys are the OWNER's. A user
 * without a saved key must never fall back to them; only the owner
 * (ALLOWED_EMAIL, lib/auth/owner.ts) may.
 */

const OWNER_EMAIL = process.env.ALLOWED_EMAIL ?? 'test@example.com'

const ENV: Record<string, string> = {
  GROQ_API_KEY: 'env-groq',
  GEMINI_API_KEY: 'env-gemini',
  FIRECRAWL_API_KEY: 'env-firecrawl',
  LAYA_API_KEY: 'env-laya',
  NEON_API_KEY: 'env-neon',
  GOOGLE_PLACES_API_KEY: 'env-places',
  ADZUNA_KEY: 'envapp:envkey',
  GITHUB_PORTFOLIO_TOKEN: 'env-gh-portfolio',
  GITHUB_TOKEN: 'env-gh-search',
  HF_TOKEN: 'env-hf',
}

function stubAllEnv() {
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v)
}

afterEach(() => {
  vi.unstubAllEnvs()
})

async function owner() {
  return makeUser(OWNER_EMAIL)
}

describe('env key fallback: owner only', () => {
  it.each(SERVICE_SECRETS.map((s) => [s.id, s.envKey] as const))('service secret %s', async (id, envKey) => {
    stubAllEnv()
    const me = await owner()
    const other = await makeUser()
    expect(await resolveServiceSecret(me.id, id)).toEqual({ key: ENV[envKey], source: 'env' })
    expect(await resolveServiceSecret(other.id, id)).toEqual({ key: null, source: 'none' })
  })

  it('a non-owner still uses their OWN saved key', async () => {
    stubAllEnv()
    const other = await makeUser()
    await keysQ.upsert(other.id, 'firecrawl', 'fc-own-key-123456')
    expect(await resolveServiceSecret(other.id, 'firecrawl')).toEqual({ key: 'fc-own-key-123456', source: 'db' })
  })

  it('AI provider keys (registry.resolveKey / resolveAiKey)', async () => {
    stubAllEnv()
    const me = await owner()
    const other = await makeUser()
    expect(await resolveKey(me.id, 'groq')).toEqual({ key: 'env-groq', source: 'env' })
    expect(await resolveKey(other.id, 'groq')).toEqual({ key: null, source: 'none' })
    expect(await resolveKey(other.id, 'google')).toEqual({ key: null, source: 'none' })
    expect(await resolveAiKey(me.id, 'gemini')).toBe('env-gemini')
    expect(await resolveAiKey(other.id, 'gemini')).toBeNull()
  })

  it('getAIProviderForUser gives a non-owner the "add a key" error, not the env key', async () => {
    stubAllEnv()
    const other = await makeUser()
    await expect(getAIProviderForUser(other.id)).rejects.toThrow(/add/i)
    const me = await owner()
    await expect(getAIProviderForUser(me.id)).resolves.toBeDefined()
  })

  it('settings pages do not reveal that the owner configured env keys', async () => {
    stubAllEnv()
    const me = await owner()
    const other = await makeUser()
    const mine = await listServiceSecretStatuses(me.id)
    const theirs = await listServiceSecretStatuses(other.id)
    expect(mine.every((s) => s.source === 'env')).toBe(true)
    expect(theirs.every((s) => s.source === 'none')).toBe(true)
    const providers = await getProviderStatuses(other.id)
    expect(providers.some((p) => p.keySource === 'env')).toBe(false)
    expect((await getProviderStatuses(me.id)).some((p) => p.keySource === 'env')).toBe(true)
  })

  it('decisions: a key-lookup error never falls back to the env key', async () => {
    stubAllEnv()
    const other = await makeUser()
    const failing = async () => {
      throw new Error('db down')
    }
    expect(await resolveDecisionKeys(other.id, { resolveAi: failing, resolveSecret: failing })).toEqual({
      groqKey: null,
      layaKey: null,
    })
    expect(await resolveDecisionKeys(other.id)).toEqual({ groqKey: null, layaKey: null })
    const me = await owner()
    expect(await resolveDecisionKeys(me.id)).toEqual({ groqKey: 'env-groq', layaKey: 'env-laya' })
  })

  it('adzuna: no env key for a non-owner, and none without a user', async () => {
    stubAllEnv()
    const other = await makeUser()
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)
    const adapter = new AdzunaAdapter()
    await expect(adapter.fetch({ country: 'in', what: 'php' }, { userId: other.id })).rejects.toThrow(/key/i)
    await expect(adapter.fetch({ country: 'in', what: 'php' })).rejects.toThrow(/key/i)
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('Neon usage meter: only the owner\'s saved key or the env key, never another user\'s', async () => {
    stubAllEnv()
    const me = await owner()
    const other = await makeUser()
    await keysQ.upsert(other.id, 'neon', 'napi_other_users_key_1')
    await db.insert(usageSettings).values({ userId: other.id, neonProjectId: 'other-project' })
    await db.insert(usageSettings).values({ userId: me.id, neonProjectId: 'owner-project' })
    expect(await resolveNeonCredentials()).toEqual({ key: 'env-neon', projectId: 'owner-project' })
    await keysQ.upsert(me.id, 'neon', 'napi_owner_saved_key_1')
    expect(await resolveNeonCredentials()).toEqual({ key: 'napi_owner_saved_key_1', projectId: 'owner-project' })
  })
})
