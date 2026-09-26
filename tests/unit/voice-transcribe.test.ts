import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from '@/app/api/voice/transcribe/route'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db/client'
import { aiCallLogs, aiQuotaSnapshots } from '@/lib/db/schema'
import { makeUser } from '@/tests/factories'

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

  describe('usage logging', () => {
    async function signedInAs(): Promise<string> {
      const u = await makeUser()
      vi.mocked(auth).mockResolvedValue({ user: { id: u.id } } as never)
      return u.id
    }
    function post(): Promise<Response> {
      return POST(
        new Request('http://localhost/api/voice/transcribe', { method: 'POST', body: makeFormData() }),
      )
    }

    it('logs the model and reported audio seconds, never the transcript, and returns usage', async () => {
      const userId = await signedInAs()
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({ text: 'PRIVATE words', duration: 12.5 }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-ratelimit-limit-requests': '2000',
            'x-ratelimit-remaining-requests': '1999',
            'x-ratelimit-reset-requests': '43.2s',
          },
        }),
      )
      const res = await post()
      const json = (await res.json()) as { text: string; usage: { callId: string; model: string } }
      const [row] = await db.select().from(aiCallLogs)
      expect(row).toMatchObject({
        userId,
        provider: 'groq',
        kind: 'voice_transcribe',
        model: 'whisper-large-v3',
        status: 'ok',
        httpStatus: 200,
        audioSeconds: 12.5,
        inputBytes: null,
      })
      expect(JSON.stringify(row)).not.toContain('PRIVATE')
      expect(json.usage).toMatchObject({ callId: row!.id, model: 'whisper-large-v3', audioSeconds: 12.5 })
      const init = vi.mocked(globalThis.fetch).mock.calls[0]![1] as RequestInit
      expect((init.body as FormData).get('response_format')).toBe('verbose_json')
      const [snap] = await db.select().from(aiQuotaSnapshots)
      expect(snap).toMatchObject({ userId, model: 'whisper-large-v3', remainingRequests: 1999 })
    })

    it('falls back to the upload size when no duration is reported', async () => {
      await signedInAs()
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({ text: 'hi' }), { status: 200 }),
      )
      await post()
      const [row] = await db.select().from(aiCallLogs)
      expect(row).toMatchObject({ audioSeconds: null, inputBytes: 4 })
    })

    it('logs a 429 as rate_limited', async () => {
      await signedInAs()
      vi.mocked(globalThis.fetch).mockResolvedValue(new Response('slow down', { status: 429 }))
      expect((await post()).status).toBe(502)
      const [row] = await db.select().from(aiCallLogs)
      expect(row).toMatchObject({ status: 'rate_limited', httpStatus: 429, inputBytes: 4 })
    })
  })
})
