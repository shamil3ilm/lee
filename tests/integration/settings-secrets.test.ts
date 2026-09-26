import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as keysQ from '@/lib/db/queries/labProviderKeys'
import * as profileQ from '@/lib/db/queries/profile'
import {
  saveServiceSecretAction,
  removeServiceSecretAction,
  testServiceSecretAction,
} from '@/app/(authed)/settings/ai/actions'
import { resolveServiceSecret, listServiceSecretStatuses } from '@/lib/settings/secrets'
import { getAIProviderForUser } from '@/lib/ai'
import { getDecisionProviderForUser, GroqDecisionProvider } from '@/lib/decisions'
import { makeUser } from '@/tests/factories'

const sessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-session', () => ({ requireUserId: sessionMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

const KEY = 'fc-abcdef123456'

function stubFetch(impl: () => Promise<Response>) {
  const fn = vi.fn(impl)
  vi.stubGlobal('fetch', fn)
  return fn
}

const saved: Record<string, string | undefined> = {}
beforeEach(() => {
  sessionMock.mockReset()
  for (const k of ['FIRECRAWL_API_KEY', 'LAYA_API_KEY', 'GROQ_API_KEY']) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})
afterEach(() => {
  vi.unstubAllGlobals()
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

describe('saveServiceSecretAction', () => {
  it('verifies, stores encrypted and only returns last4', async () => {
    const me = await makeUser()
    sessionMock.mockResolvedValue(me.id)
    const fetchMock = stubFetch(async () => new Response('{}', { status: 200 }))

    const r = await saveServiceSecretAction('firecrawl', KEY)
    expect(r).toEqual({ success: true, last4: '3456', verified: true, warning: null })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.firecrawl.dev/v1/team/credit-usage')
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`)
    expect(await keysQ.getDecrypted(me.id, 'firecrawl')).toBe(KEY)
    expect(JSON.stringify(r)).not.toContain(KEY)
  })

  it('does not store a key the service rejects', async () => {
    const me = await makeUser()
    sessionMock.mockResolvedValue(me.id)
    stubFetch(async () => new Response('nope', { status: 401 }))
    expect(await saveServiceSecretAction('firecrawl', KEY)).toEqual({
      error: 'Firecrawl rejected this key.',
    })
    expect(await keysQ.getDecrypted(me.id, 'firecrawl')).toBeNull()
  })

  it('saves with a warning when the service cannot be reached', async () => {
    const me = await makeUser()
    sessionMock.mockResolvedValue(me.id)
    stubFetch(async () => {
      throw new TypeError('fetch failed')
    })
    const r = await saveServiceSecretAction('laya', 'laya-token-123456')
    expect(r).toMatchObject({ success: true, verified: false })
    expect('warning' in r && r.warning).toMatch(/not verified/)
    expect(await keysQ.getDecrypted(me.id, 'laya')).toBe('laya-token-123456')
  })

  it('checks a Laya key against the user\'s own endpoint', async () => {
    const me = await makeUser()
    await profileQ.upsert(me.id, { layaEndpoint: 'https://laya.example.com/' })
    sessionMock.mockResolvedValue(me.id)
    const fetchMock = stubFetch(async () => new Response('{}', { status: 200 }))
    await saveServiceSecretAction('laya', 'laya-token-123456')
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('https://laya.example.com/config')
  })

  it('never calls a private or localhost Laya endpoint (SSRF guard)', async () => {
    const me = await makeUser()
    sessionMock.mockResolvedValue(me.id)
    const fetchMock = stubFetch(async () => new Response('{}', { status: 200 }))
    for (const endpoint of ['http://169.254.169.254', 'https://localhost:8080', 'https://10.0.0.5', 'http://laya.example.com']) {
      await profileQ.upsert(me.id, { layaEndpoint: endpoint })
      const r = await saveServiceSecretAction('laya', 'laya-token-123456')
      expect(r).toMatchObject({ success: true, verified: false })
      expect('warning' in r && r.warning).toMatch(/public https URL/)
      expect(await testServiceSecretAction('laya')).toEqual({
        ok: false,
        error: 'Laya endpoint must be a public https URL.',
      })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('validates the id and the key shape', async () => {
    const me = await makeUser()
    sessionMock.mockResolvedValue(me.id)
    expect(await saveServiceSecretAction('groq', KEY)).toEqual({ error: 'Unknown setting.' })
    expect(await saveServiceSecretAction('firecrawl', 'short')).toEqual({ error: 'Key looks too short' })
    expect(await saveServiceSecretAction('firecrawl', 'has space in it')).toEqual({
      error: 'Key must not contain spaces',
    })
  })
})

describe('resolution: the UI value wins, env is the fallback', () => {
  it('uses env when nothing is saved, the saved key once saved, env again after removal', async () => {
    const me = await makeUser()
    sessionMock.mockResolvedValue(me.id)
    process.env.FIRECRAWL_API_KEY = 'env-firecrawl-key'
    expect(await resolveServiceSecret(me.id, 'firecrawl')).toEqual({
      key: 'env-firecrawl-key',
      source: 'env',
    })

    await keysQ.upsert(me.id, 'firecrawl', KEY)
    expect(await resolveServiceSecret(me.id, 'firecrawl')).toEqual({ key: KEY, source: 'db' })
    const statuses = await listServiceSecretStatuses(me.id)
    expect(statuses.find((s) => s.info.id === 'firecrawl')).toMatchObject({ source: 'db', last4: '3456' })

    expect(await removeServiceSecretAction('firecrawl')).toEqual({ success: true })
    expect((await resolveServiceSecret(me.id, 'firecrawl')).source).toBe('env')
  })

  it("never resolves another user's saved key", async () => {
    const me = await makeUser()
    const other = await makeUser()
    await keysQ.upsert(other.id, 'firecrawl', KEY)
    expect(await resolveServiceSecret(me.id, 'firecrawl')).toEqual({ key: null, source: 'none' })
    sessionMock.mockResolvedValue(me.id)
    // Removing "mine" leaves theirs alone.
    await removeServiceSecretAction('firecrawl')
    expect(await keysQ.getDecrypted(other.id, 'firecrawl')).toBe(KEY)
  })

  it('app AI calls use the Groq key saved in Settings › AI over GROQ_API_KEY', async () => {
    const me = await makeUser()
    process.env.GROQ_API_KEY = 'env-groq-key'
    await profileQ.upsert(me.id, { aiProvider: 'groq', aiModel: 'openai/gpt-oss-20b' })
    await keysQ.upsert(me.id, 'groq', 'gsk_user_saved_key_1234')

    const ai = await getAIProviderForUser(me.id)
    expect((ai as unknown as { apiKey: string }).apiKey).toBe('gsk_user_saved_key_1234')

    const decisions = await getDecisionProviderForUser(me.id)
    const chain = (decisions as unknown as { chain: Array<{ provider: unknown }> }).chain
    const groq = chain.map((e) => e.provider).find((p) => p instanceof GroqDecisionProvider)
    expect((groq as unknown as { apiKey: string }).apiKey).toBe('gsk_user_saved_key_1234')
  })

  it('app AI calls fall back to GROQ_API_KEY when no key is saved', async () => {
    const me = await makeUser()
    process.env.GROQ_API_KEY = 'env-groq-key'
    await profileQ.upsert(me.id, { aiProvider: 'groq', aiModel: 'openai/gpt-oss-20b' })
    const ai = await getAIProviderForUser(me.id)
    expect((ai as unknown as { apiKey: string }).apiKey).toBe('env-groq-key')
  })

  it('a missing key is a friendly error pointing at Settings', async () => {
    const me = await makeUser()
    await profileQ.upsert(me.id, { aiProvider: 'groq', aiModel: 'openai/gpt-oss-20b' })
    await expect(getAIProviderForUser(me.id)).rejects.toThrow(/Settings › AI/)
  })
})

describe('testServiceSecretAction', () => {
  it('reports when no key is configured', async () => {
    const me = await makeUser()
    sessionMock.mockResolvedValue(me.id)
    expect(await testServiceSecretAction('firecrawl')).toEqual({ ok: false, error: 'No key configured.' })
  })

  it('tests the key in effect', async () => {
    const me = await makeUser()
    sessionMock.mockResolvedValue(me.id)
    await keysQ.upsert(me.id, 'firecrawl', KEY)
    stubFetch(async () => new Response('{}', { status: 200 }))
    expect(await testServiceSecretAction('firecrawl')).toEqual({ ok: true, error: null })
    expect(await testServiceSecretAction('nope')).toEqual({ ok: false, error: 'Unknown setting.' })
  })
})

describe('saveDecisionProviderAction endpoint guard', () => {
  it('rejects private / localhost / plain-http Laya endpoints', async () => {
    const { saveDecisionProviderAction } = await import('@/app/(authed)/settings/profile/actions')
    const me = await makeUser()
    sessionMock.mockResolvedValue(me.id)
    for (const endpoint of ['http://169.254.169.254', 'https://127.0.0.1', 'https://localhost']) {
      const fd = new FormData()
      fd.set('provider', 'laya')
      fd.set('layaEndpoint', endpoint)
      expect(await saveDecisionProviderAction(fd)).toEqual({
        error: 'Laya endpoint must be a public https URL',
      })
    }
    const ok = new FormData()
    ok.set('provider', 'laya')
    ok.set('layaEndpoint', 'https://laya.example.com')
    expect(await saveDecisionProviderAction(ok)).toEqual({ success: true })
  })
})
