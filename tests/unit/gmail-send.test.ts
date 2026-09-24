import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the token accessor so the send call is fully self-contained.
vi.mock('@/lib/google/tokens', () => ({
  getGoogleTokens: vi.fn(async () => ({
    accessToken: 'access-token-abc',
    refreshToken: 'refresh-token',
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  })),
  NoGoogleAccountError: class NoGoogleAccountError extends Error {},
}))

import { sendEmail, buildRawMessage } from '@/lib/gmail/send'

describe('buildRawMessage', () => {
  it('emits multipart/alternative with text + html parts', () => {
    const raw = buildRawMessage({
      to: 'me@example.com',
      subject: 'Hello',
      htmlBody: '<p>Hi</p>',
    })
    expect(raw).toContain('To: me@example.com')
    expect(raw).toContain('Subject: Hello')
    expect(raw).toMatch(/Content-Type: multipart\/alternative; boundary="[^"]+"/)
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"')
    expect(raw).toContain('Content-Type: text/html; charset="UTF-8"')
    expect(raw).toContain('<p>Hi</p>')
    // Falls back to a stripped text body when textBody not provided.
    expect(raw).toContain('Hi')
  })

  it('encodes unicode subjects via RFC 2047', () => {
    const raw = buildRawMessage({
      to: 'me@example.com',
      subject: 'weekly · 3 apps ✨',
      htmlBody: '<p>body</p>',
    })
    expect(raw).toMatch(/Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/)
  })
})

describe('sendEmail', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = typeof url === 'string' ? url : url.toString()
      if (u.includes('gmail.googleapis.com') && u.endsWith('/messages/send')) {
        const body = JSON.parse((init?.body as string) ?? '{}')
        expect(body.raw).toBeTypeOf('string')
        // Must be base64url — no `+`, `/`, or `=` in the encoded payload.
        expect(body.raw).not.toMatch(/[+/=]/)
        return new Response(
          JSON.stringify({ id: 'msg-123', threadId: 'thr-1' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      throw new Error(`unexpected fetch ${u}`)
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('sends via Gmail API and returns the message id', async () => {
    const r = await sendEmail({
      userId: 'u-1',
      to: 'me@example.com',
      subject: 'Test',
      htmlBody: '<p>hi</p>',
    })
    expect(r.messageId).toBe('msg-123')
  })

  it('throws on non-2xx Gmail response', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response('quota exceeded', {
          status: 429,
          headers: { 'content-type': 'text/plain' },
        }),
    ) as unknown as typeof fetch
    await expect(
      sendEmail({ userId: 'u-1', to: 'me@example.com', subject: 'x', htmlBody: '<p>y</p>' }),
    ).rejects.toThrow(/gmail send 429/)
  })
})
