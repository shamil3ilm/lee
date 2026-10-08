import { describe, expect, it, vi, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { discoveries, sources } from '@/lib/db/schema'
import { updateEmployerWatch } from '@/app/(authed)/settings/sources/actions'
import { lastSeenBySource } from '@/lib/defaults/watch-last-seen'
import { makeSource, makeUser } from '@/tests/factories'

const sessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-session', () => ({ requireUserId: sessionMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

beforeEach(() => sessionMock.mockReset())

async function configOf(id: string): Promise<Record<string, unknown>> {
  const [row] = await db.select().from(sources).where(eq(sources.id, id))
  return (row?.config ?? {}) as Record<string, unknown>
}

describe('updateEmployerWatch', () => {
  it('records "Checked" and switches watching off, keeping the link', async () => {
    const me = await makeUser()
    const s = await makeSource(me.id, { kind: 'watch', name: 'DEWA careers', config: { url: 'https://www.dewa.gov.ae/en/about-us/careers', employer: 'dewa' } })
    sessionMock.mockResolvedValue(me.id)

    expect(await updateEmployerWatch(s.id, { checked: true })).toEqual({ success: true })
    expect(typeof (await configOf(s.id)).lastCheckedAt).toBe('string')
    expect(await updateEmployerWatch(s.id, { watching: false })).toEqual({ success: true })
    const config = await configOf(s.id)
    expect(config).toMatchObject({ url: 'https://www.dewa.gov.ae/en/about-us/careers', employer: 'dewa', watching: false })
  })

  it("refuses another user's source, polled sources and bad input", async () => {
    const me = await makeUser()
    const other = await makeUser()
    const theirs = await makeSource(other.id, { kind: 'watch', config: { url: 'https://example.com' } })
    const polled = await makeSource(me.id, { kind: 'greenhouse', config: { company: 'x' } })
    sessionMock.mockResolvedValue(me.id)
    expect(await updateEmployerWatch(theirs.id, { checked: true })).toEqual({ error: 'Source not found.' })
    expect(await updateEmployerWatch(polled.id, { checked: true })).toEqual({ error: 'Source not found.' })
    expect(await updateEmployerWatch('not-a-uuid', { checked: true })).toEqual({ error: 'Source not found.' })
    expect(await updateEmployerWatch(polled.id, { checked: 'yes' } as never)).toEqual({ error: 'Invalid change.' })
  })
})

describe('lastSeenBySource', () => {
  it('returns the newest discovery per source for the user only', async () => {
    const me = await makeUser()
    const s = await makeSource(me.id, { kind: 'phenom', config: { host: 'jobs.example.ae', pageId: 'page1' } })
    const empty = await makeSource(me.id, { kind: 'workday', config: { url: 'https://x.wd1.myworkdayjobs.com/Site' } })
    const base = { userId: me.id, sourceId: s.id, raw: {}, normalized: { title: 'Engineer' } }
    await db.insert(discoveries).values([
      { ...base, sourceJobId: 'a', createdAt: new Date('2026-10-01T00:00:00Z') },
      { ...base, sourceJobId: 'b', createdAt: new Date('2026-10-07T00:00:00Z') },
    ])
    const seen = await lastSeenBySource(me.id, [s.id, empty.id])
    expect(seen.get(s.id)?.toISOString()).toBe('2026-10-07T00:00:00.000Z')
    expect(seen.has(empty.id)).toBe(false)
    expect((await lastSeenBySource(me.id, [])).size).toBe(0)
  })
})
