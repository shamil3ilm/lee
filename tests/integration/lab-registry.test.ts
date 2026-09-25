import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeUser } from '@/tests/factories'
import * as keysQ from '@/lib/db/queries/labProviderKeys'
import { MissingKeyError } from '@/lib/lab/providers/errors'
import {
  _clearModelCache,
  buildEndpoint,
  listModels,
  resolveKey,
} from '@/lib/lab/providers/registry'

function modelsFetch(body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
}

const savedGroq = process.env.GROQ_API_KEY

beforeEach(() => {
  _clearModelCache()
  delete process.env.GROQ_API_KEY
})

afterEach(() => {
  if (savedGroq === undefined) delete process.env.GROQ_API_KEY
  else process.env.GROQ_API_KEY = savedGroq
})

describe('resolveKey', () => {
  it('prefers the DB key, then env, then none', async () => {
    const u = await makeUser()
    expect(await resolveKey(u.id, 'groq')).toEqual({ key: null, source: 'none' })
    process.env.GROQ_API_KEY = 'gsk_env_key_000000000000'
    expect(await resolveKey(u.id, 'groq')).toEqual({ key: 'gsk_env_key_000000000000', source: 'env' })
    await keysQ.upsert(u.id, 'groq', 'gsk_db_key_1111111111111')
    expect(await resolveKey(u.id, 'groq')).toEqual({ key: 'gsk_db_key_1111111111111', source: 'db' })
  })

  it('providers without an env fallback resolve to none', async () => {
    const u = await makeUser()
    expect((await resolveKey(u.id, 'cerebras')).source).toBe('none')
  })
})

describe('buildEndpoint', () => {
  it('adds OpenRouter attribution headers', () => {
    const ep = buildEndpoint('openrouter', 'k')
    expect(ep.baseUrl).toBe('https://openrouter.ai/api/v1')
    expect(ep.extraHeaders?.['HTTP-Referer']).toBeTruthy()
    expect(ep.extraHeaders?.['X-Title']).toBe('Employ Model Playground')
  })

  it('refuses browser-side providers', () => {
    expect(() => buildEndpoint('webllm', null)).toThrow(/not available yet/)
    expect(() => buildEndpoint('ollama', null)).toThrow(/not available yet/)
  })
})

describe('listModels', () => {
  it('throws MissingKeyError when no key is configured', async () => {
    const u = await makeUser()
    await expect(listModels(u.id, 'cerebras', { fetchImpl: modelsFetch({ data: [] }) as unknown as typeof fetch })).rejects.toBeInstanceOf(MissingKeyError)
  })

  it('fetches, parses and caches per user+provider for ~3h', async () => {
    const u = await makeUser()
    await keysQ.upsert(u.id, 'openrouter', 'sk-or-v1-zzzzzzzzzzzzzzzzzzzz9999')
    const f = modelsFetch({ data: [{ id: 'x/y:free', name: 'Y' }] })
    const fetchImpl = f as unknown as typeof fetch
    const t0 = 1_000_000
    const first = await listModels(u.id, 'openrouter', { fetchImpl, now: t0 })
    expect(first).toEqual([{ id: 'x/y:free', label: 'Y', contextLength: undefined, free: true }])
    await listModels(u.id, 'openrouter', { fetchImpl, now: t0 + 60 * 60 * 1000 })
    expect(f).toHaveBeenCalledTimes(1)
    await listModels(u.id, 'openrouter', { fetchImpl, now: t0 + 3 * 60 * 60 * 1000 + 1 })
    expect(f).toHaveBeenCalledTimes(2)
    await listModels(u.id, 'openrouter', { fetchImpl, now: t0 + 3 * 60 * 60 * 1000 + 2, refresh: true })
    expect(f).toHaveBeenCalledTimes(3)
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-or-v1-zzzzzzzzzzzzzzzzzzzz9999')
  })

  it('returns [] for browser providers without fetching', async () => {
    const u = await makeUser()
    const f = modelsFetch({})
    expect(await listModels(u.id, 'webllm', { fetchImpl: f as unknown as typeof fetch })).toEqual([])
    expect(f).not.toHaveBeenCalled()
  })
})
