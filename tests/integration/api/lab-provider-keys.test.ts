import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { makeUser } from '@/tests/factories'
import * as keysQ from '@/lib/db/queries/labProviderKeys'

const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ auth: authMock }))

// isolate:false shares the module cache across files; drop route/helper
// modules bound to another file's auth mock.
beforeAll(() => {
  vi.resetModules()
})

const KEY = 'csk-provider-keys-secret-00000000abcd'

function post(body: unknown, method = 'POST', url = 'http://l/api/lab/providers/keys'): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  authMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function signIn() {
  const u = await makeUser()
  authMock.mockResolvedValue({ user: { id: u.id } })
  return u
}

describe('POST /api/lab/providers/keys', () => {
  it('401 without a session', async () => {
    authMock.mockResolvedValue(null)
    const { POST } = await import('@/app/api/lab/providers/keys/route')
    expect((await POST(post({ provider: 'cerebras', key: KEY }))).status).toBe(401)
  })

  it('validates the body', async () => {
    await signIn()
    const { POST } = await import('@/app/api/lab/providers/keys/route')
    expect((await POST(post({ provider: 'nope', key: KEY }))).status).toBe(400)
    expect((await POST(post({ provider: 'cerebras', key: 'short' }))).status).toBe(400)
    expect((await POST(post({ provider: 'cerebras', key: 'has spaces in it' }))).status).toBe(400)
    expect((await POST(post({ provider: 'webllm', key: KEY }))).status).toBe(400)
  })

  it('rejects a key the provider refuses and does not store it', async () => {
    const u = await signIn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: { message: `bad ${KEY}` } }), { status: 401 })),
    )
    const { POST } = await import('@/app/api/lab/providers/keys/route')
    const res = await POST(post({ provider: 'cerebras', key: KEY }))
    expect(res.status).toBe(400)
    const text = await res.text()
    expect(text).toMatch(/rejected this key/)
    expect(text).not.toContain(KEY)
    expect(await keysQ.listMasked(u.id)).toEqual([])
  })

  it('validates via /models, stores encrypted, returns only last4', async () => {
    const u = await signIn()
    const f = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }))
    vi.stubGlobal('fetch', f)
    const { POST } = await import('@/app/api/lab/providers/keys/route')
    const res = await POST(post({ provider: 'cerebras', key: KEY }))
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain(KEY)
    expect(JSON.parse(text)).toEqual({ ok: true, provider: 'cerebras', last4: 'abcd' })
    expect(String(f.mock.calls[0]?.[0])).toBe('https://api.cerebras.ai/v1/models')
    expect(await keysQ.getDecrypted(u.id, 'cerebras')).toBe(KEY)

    // Provider status listing is masked too.
    const providers = await import('@/app/api/lab/providers/route')
    const pres = await providers.GET(new Request('http://l/api/lab/providers'))
    const ptext = await pres.text()
    expect(ptext).not.toContain(KEY)
    const parsed = JSON.parse(ptext) as { providers: { info: { id: string }; keySource: string; last4: string | null }[] }
    expect(parsed.providers.find((p) => p.info.id === 'cerebras')).toMatchObject({ keySource: 'db', last4: 'abcd' })
  })

  it('DELETE removes the key', async () => {
    const u = await signIn()
    await keysQ.upsert(u.id, 'cerebras', KEY)
    const { DELETE } = await import('@/app/api/lab/providers/keys/route')
    const res = await DELETE(post({ provider: 'cerebras' }, 'DELETE'))
    expect(await res.json()).toEqual({ ok: true, removed: true })
    expect(await keysQ.getDecrypted(u.id, 'cerebras')).toBeNull()
    const again = await DELETE(new Request('http://l/api/lab/providers/keys?provider=cerebras', { method: 'DELETE' }))
    expect(await again.json()).toEqual({ ok: true, removed: false })
    const bad = await DELETE(new Request('http://l/api/lab/providers/keys?provider=zzz', { method: 'DELETE' }))
    expect(bad.status).toBe(400)
  })
})

describe('GET /api/lab/models', () => {
  it('returns the live list, or a missing_key hint', async () => {
    const u = await signIn()
    const { GET } = await import('@/app/api/lab/models/route')
    const missing = (await (await GET(new Request('http://l/api/lab/models?provider=huggingface'))).json()) as {
      code: string
      models: unknown[]
    }
    expect(missing).toMatchObject({ code: 'missing_key', models: [] })

    await keysQ.upsert(u.id, 'huggingface', 'hf_modelslisttoken000000000')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'org/m' }] }), { status: 200 })),
    )
    const res = await GET(new Request('http://l/api/lab/models?provider=huggingface'))
    expect(((await res.json()) as { models: { id: string }[] }).models.map((m) => m.id)).toEqual(['org/m'])
    expect((await GET(new Request('http://l/api/lab/models?provider=bogus'))).status).toBe(400)
  })

  it('maps a 429 from the provider to 429', async () => {
    const u = await signIn()
    await keysQ.upsert(u.id, 'huggingface', 'hf_modelslisttoken111111111')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429 })))
    const { GET } = await import('@/app/api/lab/models/route')
    const res = await GET(new Request('http://l/api/lab/models?provider=huggingface&refresh=1'))
    expect(res.status).toBe(429)
  })
})
