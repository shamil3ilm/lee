import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '@/lib/db/client'
import { accounts, discoveries, sources } from '@/lib/db/schema'
import * as profileQ from '@/lib/db/queries/profile'
import { makeUser } from '@/tests/factories'

const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ auth: authMock }))

async function importRoute() {
  return import('@/app/api/notifications/discovery/test/route')
}

async function seedSource(userId: string): Promise<string> {
  const [src] = await db
    .insert(sources)
    .values({ userId, name: 'HN', kind: 'hn', config: {} })
    .returning()
  if (!src) throw new Error('failed to create source')
  return src.id
}

const originalFetch = globalThis.fetch

beforeEach(() => {
  authMock.mockReset()
  ;(globalThis as { fetch: typeof fetch }).fetch = originalFetch
})

describe('POST /api/notifications/discovery/test', () => {
  it('rejects unauthenticated requests', async () => {
    authMock.mockResolvedValue(null)
    const route = await importRoute()
    const res = await route.POST()
    expect(res.status).toBe(401)
  })

  it('returns 400 when the user has no Google account linked', async () => {
    const u = await makeUser('notif-test-nogoogle@x.com')
    const sid = await seedSource(u.id)
    await db.insert(discoveries).values({
      userId: u.id,
      sourceId: sid,
      sourceJobId: 'hn-1',
      raw: {},
      normalized: { title: 'X', companyName: 'Y' },
      matchScore: 90,
      status: 'new',
    })
    authMock.mockResolvedValue({ user: { id: u.id } })
    const route = await importRoute()
    const res = await route.POST()
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/Reconnect your Google account/i)
    // The temporary flag flip must be reverted even when the send throws.
    const profile = await profileQ.get(u.id)
    expect(profile?.notifyDiscoveryEmail).toBe(false)
  })

  it('reports reason=no_matches when the 7-day window is empty', async () => {
    const u = await makeUser('notif-test-empty@x.com')
    // Give the user a Google account so the send path isn't blocked.
    await db.insert(accounts).values({
      userId: u.id,
      type: 'oauth',
      provider: 'google',
      providerAccountId: `google-${u.id}`,
      access_token: 'AT',
      refresh_token: 'RT',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'Bearer',
      scope: 'gmail.send',
    })
    authMock.mockResolvedValue({ user: { id: u.id } })
    const route = await importRoute()
    const res = await route.POST()
    expect(res.status).toBe(200)
    const body = (await res.json()) as { sent: boolean; reason?: string }
    expect(body.sent).toBe(false)
    expect(body.reason).toBe('no_matches')
  })

  it('sends via Gmail when a fresh match exists and restores the flag afterward', async () => {
    const u = await makeUser('notif-test-send@x.com')
    const sid = await seedSource(u.id)
    await db.insert(accounts).values({
      userId: u.id,
      type: 'oauth',
      provider: 'google',
      providerAccountId: `google-${u.id}`,
      access_token: 'AT',
      refresh_token: 'RT',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'Bearer',
      scope: 'gmail.send',
    })
    await db.insert(discoveries).values({
      userId: u.id,
      sourceId: sid,
      sourceJobId: 'hn-fresh',
      raw: {},
      normalized: { title: 'Senior BE', companyName: 'Stripe' },
      matchScore: 88,
      status: 'new',
    })
    authMock.mockResolvedValue({ user: { id: u.id } })

    ;(globalThis as { fetch: typeof fetch }).fetch = (async (input: unknown) => {
      if (String(input).includes('gmail.googleapis.com')) {
        return new Response(JSON.stringify({ id: 'stub-msg' }), { status: 200 })
      }
      return new Response('nope', { status: 500 })
    }) as unknown as typeof fetch

    const route = await importRoute()
    const res = await route.POST()
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      sent: boolean
      count: number
      messageId?: string
    }
    expect(body.sent).toBe(true)
    expect(body.count).toBe(1)
    expect(body.messageId).toBe('stub-msg')

    // Flag was OFF before → restore to OFF after (button shouldn't opt users in silently).
    const profile = await profileQ.get(u.id)
    expect(profile?.notifyDiscoveryEmail).toBe(false)
  })
})
