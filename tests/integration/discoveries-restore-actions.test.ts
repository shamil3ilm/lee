import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { aiCallLogs, companyDiscoveries, discoveries } from '@/lib/db/schema'
import {
  restoreDiscoveries,
  restoreCompanyDiscovery,
} from '@/app/(authed)/discoveries/actions'
import { makeUser, makeSource, makeDiscovery } from '@/tests/factories'

const sessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-session', () => ({ requireUserId: sessionMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

beforeEach(() => sessionMock.mockReset())

async function statuses(ids: string[]): Promise<Record<string, string>> {
  const rows = await db
    .select({ id: discoveries.id, status: discoveries.status })
    .from(discoveries)
    .where(inArray(discoveries.id, ids))
  return Object.fromEntries(rows.map((r) => [r.id, r.status]))
}

describe('restoreDiscoveries', () => {
  it('moves dismissed discoveries back to new and leaves saved ones alone', async () => {
    const me = await makeUser()
    const src = await makeSource(me.id)
    const [call] = await db
      .insert(aiCallLogs)
      .values({ userId: me.id, provider: 'groq', kind: 'score_job', status: 'ok', userAction: 'dismissed' })
      .returning()
    const a = await makeDiscovery(me.id, src.id, { status: 'dismissed', scoredByCallId: call!.id })
    const b = await makeDiscovery(me.id, src.id, { status: 'dismissed' })
    const saved = await makeDiscovery(me.id, src.id, { status: 'saved' })
    sessionMock.mockResolvedValue(me.id)

    const r = await restoreDiscoveries([a.id, b.id, saved.id, 'junk'])
    expect(r).toEqual({ success: true, count: 2 })
    expect(await statuses([a.id, b.id, saved.id])).toEqual({
      [a.id]: 'new',
      [b.id]: 'new',
      [saved.id]: 'saved',
    })
    const [log] = await db.select().from(aiCallLogs).where(eq(aiCallLogs.id, call!.id))
    expect(log?.userAction).toBeNull()
  })

  it("does not restore another user's discoveries", async () => {
    const me = await makeUser()
    const other = await makeUser()
    const src = await makeSource(other.id)
    const theirs = await makeDiscovery(other.id, src.id, { status: 'dismissed' })
    sessionMock.mockResolvedValue(me.id)
    expect(await restoreDiscoveries([theirs.id])).toEqual({ success: true, count: 0 })
    expect(await statuses([theirs.id])).toEqual({ [theirs.id]: 'dismissed' })
  })
})

describe('restoreCompanyDiscovery', () => {
  async function makeCompanyDiscovery(userId: string, status: string) {
    const src = await makeSource(userId)
    const [row] = await db
      .insert(companyDiscoveries)
      .values({ userId, sourceId: src.id, sourceCompanyId: 'c1', raw: {}, normalized: { name: 'Acme' }, status })
      .returning()
    return row!
  }

  it('restores a dismissed company discovery', async () => {
    const me = await makeUser()
    const cd = await makeCompanyDiscovery(me.id, 'dismissed')
    sessionMock.mockResolvedValue(me.id)
    expect(await restoreCompanyDiscovery(cd.id)).toEqual({ success: true })
    const [row] = await db.select().from(companyDiscoveries).where(eq(companyDiscoveries.id, cd.id))
    expect(row?.status).toBe('new')
  })

  it("cannot restore another user's company discovery", async () => {
    const me = await makeUser()
    const other = await makeUser()
    const cd = await makeCompanyDiscovery(other.id, 'dismissed')
    sessionMock.mockResolvedValue(me.id)
    expect(await restoreCompanyDiscovery(cd.id)).toEqual({ error: 'Company discovery not found.' })
    const [row] = await db.select().from(companyDiscoveries).where(eq(companyDiscoveries.id, cd.id))
    expect(row?.status).toBe('dismissed')
  })
})
