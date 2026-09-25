import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '@/lib/db/client'
import { discoveries, sources } from '@/lib/db/schema'
import * as profileQ from '@/lib/db/queries/profile'
import { makeUser } from '@/tests/factories'

const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ auth: authMock }))

async function importRoute() {
  return import('@/app/api/discoveries/notifiable/route')
}

beforeEach(() => {
  authMock.mockReset()
})

async function seedSource(userId: string): Promise<string> {
  const [src] = await db
    .insert(sources)
    .values({ userId, name: 'HN', kind: 'hn', config: {} })
    .returning()
  if (!src) throw new Error('failed to create source')
  return src.id
}

describe('GET /api/discoveries/notifiable', () => {
  it('rejects unauthenticated requests', async () => {
    authMock.mockResolvedValue(null)
    const route = await importRoute()
    const res = await route.GET(
      new Request('http://localhost/api/discoveries/notifiable'),
    )
    expect(res.status).toBe(401)
  })

  it('returns empty list with disabled=true when the user opted out of browser notifications', async () => {
    const u = await makeUser('notif-route-off@x.com')
    await profileQ.upsert(u.id, { notifyDiscoveryBrowser: false })
    authMock.mockResolvedValue({ user: { id: u.id } })
    const route = await importRoute()
    const res = await route.GET(
      new Request('http://localhost/api/discoveries/notifiable'),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { discoveries: unknown[]; disabled?: boolean }
    expect(body.discoveries).toEqual([])
    expect(body.disabled).toBe(true)
  })

  it('returns fresh high-match discoveries when enabled', async () => {
    const u = await makeUser('notif-route-on@x.com')
    const sid = await seedSource(u.id)
    // Default profile: notifyDiscoveryBrowser=true, minScore=75.
    await profileQ.upsert(u.id, {})
    await db.insert(discoveries).values({
      userId: u.id,
      sourceId: sid,
      sourceJobId: 'hn-a',
      raw: {},
      normalized: { title: 'Top', companyName: 'Stripe' },
      matchScore: 90,
      status: 'new',
    })
    await db.insert(discoveries).values({
      userId: u.id,
      sourceId: sid,
      sourceJobId: 'hn-b',
      raw: {},
      normalized: { title: 'Skipped', companyName: 'Low' },
      matchScore: 50,
      status: 'new',
    })
    authMock.mockResolvedValue({ user: { id: u.id } })
    const route = await importRoute()
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const res = await route.GET(
      new Request(
        `http://localhost/api/discoveries/notifiable?since=${encodeURIComponent(since)}`,
      ),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      discoveries: { id: string; title: string; matchScore: number }[]
    }
    expect(body.discoveries).toHaveLength(1)
    expect(body.discoveries[0]?.title).toBe('Top')
    expect(body.discoveries[0]?.matchScore).toBe(90)
  })
})
