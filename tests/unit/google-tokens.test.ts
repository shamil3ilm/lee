import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { getGoogleTokens, NoGoogleAccountError } from '@/lib/google/tokens'
import { makeUser } from '@/tests/factories'

const originalFetch = globalThis.fetch

async function insertGoogleAccount(
  userId: string,
  overrides: Partial<typeof accounts.$inferInsert> = {},
): Promise<void> {
  await db.insert(accounts).values({
    userId,
    type: 'oauth',
    provider: 'google',
    providerAccountId: `google-${userId}`,
    access_token: 'stored-access-token',
    refresh_token: 'stored-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'Bearer',
    scope: 'openid email',
    ...overrides,
  })
}

describe('getGoogleTokens', () => {
  beforeEach(() => {
    ;(globalThis as { fetch: typeof fetch }).fetch = originalFetch
  })
  afterEach(() => {
    ;(globalThis as { fetch: typeof fetch }).fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('throws NoGoogleAccountError when no google account row exists', async () => {
    const user = await makeUser()
    await expect(getGoogleTokens(user.id)).rejects.toBeInstanceOf(NoGoogleAccountError)
  })

  it('throws NoGoogleAccountError when the row lacks a refresh token', async () => {
    const user = await makeUser()
    await insertGoogleAccount(user.id, { refresh_token: null })
    await expect(getGoogleTokens(user.id)).rejects.toBeInstanceOf(NoGoogleAccountError)
  })

  it('returns stored tokens when the access token is still fresh', async () => {
    const user = await makeUser()
    await insertGoogleAccount(user.id)
    const fake = vi.fn()
    ;(globalThis as { fetch: typeof fetch }).fetch = fake as unknown as typeof fetch

    const tokens = await getGoogleTokens(user.id)

    expect(tokens.accessToken).toBe('stored-access-token')
    expect(tokens.refreshToken).toBe('stored-refresh-token')
    // Fresh token means we must NOT hit Google.
    expect(fake).not.toHaveBeenCalled()
  })

  it('refreshes and persists the new access token when expired', async () => {
    const user = await makeUser()
    const past = Math.floor(Date.now() / 1000) - 60
    await insertGoogleAccount(user.id, { expires_at: past })

    const fake = vi.fn(async () =>
      new Response(
        JSON.stringify({ access_token: 'refreshed-access', expires_in: 3600 }),
        { status: 200 },
      ),
    )
    ;(globalThis as { fetch: typeof fetch }).fetch = fake as unknown as typeof fetch

    const tokens = await getGoogleTokens(user.id)

    expect(tokens.accessToken).toBe('refreshed-access')
    expect(tokens.refreshToken).toBe('stored-refresh-token')
    expect(fake).toHaveBeenCalledOnce()
    const firstCall = fake.mock.calls[0]
    expect(firstCall).toBeDefined()
    const [url, init] = firstCall as unknown as [string, RequestInit]
    expect(url).toBe('https://oauth2.googleapis.com/token')
    expect(init.method).toBe('POST')
    const body = init.body as URLSearchParams
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('stored-refresh-token')

    const persisted = await db.query.accounts.findFirst({
      where: and(eq(accounts.userId, user.id), eq(accounts.provider, 'google')),
    })
    expect(persisted?.access_token).toBe('refreshed-access')
    expect(persisted?.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000) + 3500)
  })

  it('refreshes when the stored token is within the 60s skew window', async () => {
    const user = await makeUser()
    // 30s in the future — inside the 60s buffer, so still needs refresh.
    const soon = Math.floor(Date.now() / 1000) + 30
    await insertGoogleAccount(user.id, { expires_at: soon })

    const fake = vi.fn(async () =>
      new Response(
        JSON.stringify({ access_token: 'refreshed', expires_in: 3600 }),
        { status: 200 },
      ),
    )
    ;(globalThis as { fetch: typeof fetch }).fetch = fake as unknown as typeof fetch

    const tokens = await getGoogleTokens(user.id)
    expect(tokens.accessToken).toBe('refreshed')
    expect(fake).toHaveBeenCalledOnce()
  })

  it('surfaces Google errors with the status code', async () => {
    const user = await makeUser()
    const past = Math.floor(Date.now() / 1000) - 60
    await insertGoogleAccount(user.id, { expires_at: past })
    ;(globalThis as { fetch: typeof fetch }).fetch = (async () =>
      new Response('bad grant', { status: 400 })) as unknown as typeof fetch

    await expect(getGoogleTokens(user.id)).rejects.toThrow(/400/)
  })
})
