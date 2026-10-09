import { afterEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import type { Adapter, AdapterAccount } from 'next-auth/adapters'
import { db } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { decryptToken, isEncrypted } from '@/lib/crypto/token-vault'
import {
  encryptAccountTokenPatch,
  encryptPlaintextAccountTokens,
  withEncryptedAccountTokens,
} from '@/lib/auth/account-tokens'
import { getGoogleTokens, mintScopedAccessToken } from '@/lib/google/tokens'
import { makeUser } from '@/tests/factories'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

async function row(userId: string) {
  const r = await db.query.accounts.findFirst({
    where: and(eq(accounts.userId, userId), eq(accounts.provider, 'google')),
  })
  if (!r) throw new Error('no row')
  return r
}

async function insertPlaintext(userId: string, expiresAt: number) {
  await db.insert(accounts).values({
    userId,
    type: 'oauth',
    provider: 'google',
    providerAccountId: `g-${userId}`,
    access_token: 'ya29.plain-access',
    refresh_token: '1//plain-refresh',
    id_token: 'eyJplain.id.token',
    expires_at: expiresAt,
    token_type: 'Bearer',
    scope: 'openid email https://www.googleapis.com/auth/gmail.readonly',
  })
}

/** A minimal adapter that writes accounts like DrizzleAdapter does. */
function fakeBaseAdapter(): Adapter {
  return {
    async linkAccount(account: AdapterAccount) {
      await db.insert(accounts).values(account as typeof accounts.$inferInsert)
    },
    async getAccount(providerAccountId: string, provider: string) {
      const r = await db.query.accounts.findFirst({
        where: and(eq(accounts.providerAccountId, providerAccountId), eq(accounts.provider, provider)),
      })
      return (r ?? null) as AdapterAccount | null
    },
  }
}

describe('Google OAuth tokens are encrypted at rest', () => {
  it('linkAccount (Auth.js adapter) stores ciphertext, getAccount returns plaintext', async () => {
    const user = await makeUser()
    const adapter = withEncryptedAccountTokens(fakeBaseAdapter())
    await adapter.linkAccount!({
      userId: user.id,
      type: 'oidc',
      provider: 'google',
      providerAccountId: 'g-123',
      access_token: 'ya29.fresh-access',
      refresh_token: '1//fresh-refresh',
      id_token: 'eyJ.fresh.id',
      expires_at: 2_000_000_000,
      token_type: 'bearer',
      scope: 'openid email',
    })
    const stored = await row(user.id)
    for (const col of ['access_token', 'refresh_token', 'id_token'] as const) {
      expect(isEncrypted(stored[col])).toBe(true)
      expect(stored[col]).not.toContain('fresh')
    }
    expect(stored.scope).toBe('openid email') // non-secret columns untouched
    const read = await adapter.getAccount!('g-123', 'google')
    expect(read?.access_token).toBe('ya29.fresh-access')
    expect(read?.refresh_token).toBe('1//fresh-refresh')
  })

  it('the sign-in re-consent patch is encrypted', () => {
    const patch = encryptAccountTokenPatch({ access_token: 'a', refresh_token: 'r', scope: 's', expires_at: 1 })
    expect(isEncrypted(patch.access_token as string)).toBe(true)
    expect(isEncrypted(patch.refresh_token as string)).toBe(true)
    expect(patch.scope).toBe('s')
    expect(patch.expires_at).toBe(1)
  })

  it('getGoogleTokens decrypts, and refresh stores the new access token encrypted', async () => {
    const user = await makeUser()
    const adapter = withEncryptedAccountTokens(fakeBaseAdapter())
    await adapter.linkAccount!({
      userId: user.id,
      type: 'oidc',
      provider: 'google',
      providerAccountId: `g-${user.id}`,
      access_token: 'ya29.old',
      refresh_token: '1//the-refresh',
      expires_at: Math.floor(Date.now() / 1000) - 10,
    })
    const fake = vi.fn(async () => new Response(JSON.stringify({ access_token: 'ya29.new', expires_in: 3600 }), { status: 200 }))
    globalThis.fetch = fake as unknown as typeof fetch

    const tokens = await getGoogleTokens(user.id)
    expect(tokens).toMatchObject({ accessToken: 'ya29.new', refreshToken: '1//the-refresh' })
    // Google got the decrypted refresh token, not the envelope.
    const body = (fake.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams
    expect(body.get('refresh_token')).toBe('1//the-refresh')

    const stored = await row(user.id)
    expect(isEncrypted(stored.access_token)).toBe(true)
    expect(decryptToken(stored.access_token)).toBe('ya29.new')

    // Fresh now: a second read decrypts without calling Google.
    fake.mockClear()
    expect((await getGoogleTokens(user.id)).accessToken).toBe('ya29.new')
    expect(fake).not.toHaveBeenCalled()
  })

  it('Drive picker token minting sends the decrypted refresh token', async () => {
    const user = await makeUser()
    await withEncryptedAccountTokens(fakeBaseAdapter()).linkAccount!({
      userId: user.id,
      type: 'oidc',
      provider: 'google',
      providerAccountId: `g-${user.id}`,
      refresh_token: '1//drive-refresh',
      access_token: 'ya29.x',
    })
    const scope = 'https://www.googleapis.com/auth/drive.file'
    const fake = vi.fn(async () => new Response(JSON.stringify({ access_token: 'ya29.picker', expires_in: 600, scope }), { status: 200 }))
    globalThis.fetch = fake as unknown as typeof fetch
    await expect(mintScopedAccessToken(user.id, scope)).resolves.toEqual({ accessToken: 'ya29.picker', expiresIn: 600 })
    const body = (fake.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams
    expect(body.get('refresh_token')).toBe('1//drive-refresh')
  })

  it('a legacy plaintext row still works and is re-encrypted on first read', async () => {
    const user = await makeUser()
    await insertPlaintext(user.id, Math.floor(Date.now() / 1000) + 3600)
    globalThis.fetch = vi.fn() as unknown as typeof fetch

    const tokens = await getGoogleTokens(user.id)
    expect(tokens).toMatchObject({ accessToken: 'ya29.plain-access', refreshToken: '1//plain-refresh' })

    const stored = await row(user.id)
    expect(isEncrypted(stored.access_token)).toBe(true)
    expect(isEncrypted(stored.refresh_token)).toBe(true)
    expect(isEncrypted(stored.id_token)).toBe(true)
    expect(decryptToken(stored.refresh_token)).toBe('1//plain-refresh')
  })
})

describe('encryptPlaintextAccountTokens (one-time migration)', () => {
  it('encrypts plaintext rows, leaves encrypted ones alone, and is safe to run twice', async () => {
    const a = await makeUser()
    const b = await makeUser()
    await insertPlaintext(a.id, 1)
    await withEncryptedAccountTokens(fakeBaseAdapter()).linkAccount!({
      userId: b.id,
      type: 'oidc',
      provider: 'google',
      providerAccountId: `g-${b.id}`,
      access_token: 'ya29.b',
      refresh_token: '1//b',
    })
    const bBefore = await row(b.id)

    const first = await encryptPlaintextAccountTokens()
    expect(first.updated).toBe(1)

    const aAfter = await row(a.id)
    expect(isEncrypted(aAfter.access_token)).toBe(true)
    expect(decryptToken(aAfter.access_token)).toBe('ya29.plain-access')
    expect(decryptToken(aAfter.id_token)).toBe('eyJplain.id.token')
    expect(aAfter.scope).toContain('gmail.readonly')
    // Already-encrypted row untouched (same ciphertext).
    expect((await row(b.id)).access_token).toBe(bBefore.access_token)

    const second = await encryptPlaintextAccountTokens()
    expect(second.updated).toBe(0)
    expect((await row(a.id)).access_token).toBe(aAfter.access_token)
  })
})
