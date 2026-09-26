import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from '@/app/api/voice/transcribe/route'

// Auth is mocked to return a fixed userId — the route only touches auth() to
// gate access, and integration tests exercise deeper flows elsewhere. This
// lets us focus on the multipart forwarding + upstream error handling.
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { id: 'u-1' } })),
}))

// The route resolves the user's Groq key (Settings › AI, else env). Stub the
// resolver so the forwarding tests don't depend on the key store.
const resolveAiKeyMock = vi.hoisted(() => vi.fn(async () => 'test-groq-key' as string | null))
vi.mock('@/lib/settings/secrets', () => ({ resolveAiKey: resolveAiKeyMock }))

function makeFormData(): FormData {
  const form = new FormData()
  const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' })
  form.append('file', blob, 'voice.webm')
  return form
}

describe('POST /api/voice/transcribe', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch')
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('returns transcribed text on Groq success', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ text: 'hello world' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const form = makeFormData()
    const req = new Request('http://localhost/api/voice/transcribe', {
      method: 'POST',
      body: form,
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { text: string }
    expect(json.text).toBe('hello world')
    // Verify upstream got called with model & auth header.
    const call = vi.mocked(globalThis.fetch).mock.calls[0]!
    const url = String(call[0])
    const init = call[1] as RequestInit
    expect(url).toContain('api.groq.com')
    expect(String((init.headers as Record<string, string>).authorization)).toBe(
      'Bearer test-groq-key',
    )
  })

  it('returns 503 with a pointer to Settings when no Groq key is available', async () => {
    resolveAiKeyMock.mockResolvedValueOnce(null)
    const req = new Request('http://localhost/api/voice/transcribe', {
      method: 'POST',
      body: makeFormData(),
    })
    const res = await POST(req)
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/Settings › AI/)
    expect(resolveAiKeyMock).toHaveBeenCalledWith('u-1', 'groq')
  })

  it('rejects when file field is missing', async () => {
    const form = new FormData()
    const req = new Request('http://localhost/api/voice/transcribe', {
      method: 'POST',
      body: form,
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('rejects an empty file', async () => {
    const form = new FormData()
    const blob = new Blob([], { type: 'audio/webm' })
    form.append('file', blob, 'voice.webm')
    const req = new Request('http://localhost/api/voice/transcribe', {
      method: 'POST',
      body: form,
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('surfaces a friendly 502 when Groq returns an error', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response('rate limited', { status: 429 }),
    )
    const form = makeFormData()
    const req = new Request('http://localhost/api/voice/transcribe', {
      method: 'POST',
      body: form,
    })
    const res = await POST(req)
    expect(res.status).toBe(502)
    const json = (await res.json()) as { error: string }
    expect(json.error).toMatch(/Transcription service/)
  })
})
