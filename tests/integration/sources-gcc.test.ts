import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { queueJobs, sources } from '@/lib/db/schema'
import { addSource } from '@/app/(authed)/settings/sources/actions'
import { checkServiceKey } from '@/lib/settings/secrets'
import * as emailAlertsQ from '@/lib/db/queries/emailAlerts'
import { makeUser } from '@/tests/factories'

const sessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-session', () => ({ requireUserId: sessionMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

function fd(values: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(values)) f.set(k, v)
  return f
}

beforeEach(() => sessionMock.mockReset())

describe('watch sources', () => {
  it('are saved switched off and never queued for polling', async () => {
    const me = await makeUser()
    sessionMock.mockResolvedValue(me.id)
    const r = await addSource(fd({ kind: 'watch', url: 'https://careers.example.com/jobs', name: 'Example careers' }))
    expect(r).toEqual({ success: true })
    const [row] = await db.select().from(sources).where(eq(sources.userId, me.id))
    expect(row).toMatchObject({ kind: 'watch', enabled: false, config: { url: 'https://careers.example.com/jobs' } })
    expect(await db.select().from(queueJobs).where(eq(queueJobs.userId, me.id))).toHaveLength(0)
  })

  it('new job-search kinds that need no config can be added', async () => {
    const me = await makeUser()
    sessionMock.mockResolvedValue(me.id)
    for (const kind of ['himalayas', 'email_alert', 'jobicy']) {
      expect(await addSource(fd({ kind }))).toEqual({ success: true })
    }
    const rows = await db.select().from(sources).where(eq(sources.userId, me.id))
    expect(rows.map((s) => s.kind).sort()).toEqual(['email_alert', 'himalayas', 'jobicy'])
  })
})

describe('Adzuna key check', () => {
  it('accepts APP_ID:APP_KEY that Adzuna answers 200 for', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('app_id=abc')
      expect(url).toContain('app_key=def123')
      return new Response('{"results":[]}', { status: 200 })
    })
    expect(await checkServiceKey('adzuna', 'abc:def123', { fetchImpl: fetchImpl as unknown as typeof fetch })).toEqual({
      ok: true,
      error: null,
      rejected: false,
    })
  })

  it('rejects a malformed key without calling Adzuna, and a 401', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 401 }))
    const bad = await checkServiceKey('adzuna', 'no-colon-here', { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(bad.rejected).toBe(true)
    expect(fetchImpl).not.toHaveBeenCalled()
    const denied = await checkServiceKey('adzuna', 'abc:wrong', { fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(denied).toMatchObject({ ok: false, rejected: true })
  })
})

describe('email alert counters', () => {
  it('upserts per message and summarises per site, scoped to the user', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const at = (d: string) => new Date(`2026-09-${d}T06:00:00Z`)
    await emailAlertsQ.record(a.id, [
      { messageId: 'm1', site: 'naukri', receivedAt: at('20'), jobsFound: 4 },
      { messageId: 'm2', site: 'naukri', receivedAt: at('25'), jobsFound: 0 },
      { messageId: 'm3', site: 'bayt', receivedAt: at('22'), jobsFound: 2 },
    ])
    await emailAlertsQ.record(a.id, [{ messageId: 'm2', site: 'naukri', receivedAt: at('25'), jobsFound: 3 }])
    await emailAlertsQ.record(b.id, [{ messageId: 'm1', site: 'indeed', receivedAt: at('26'), jobsFound: 9 }])

    const summary = await emailAlertsQ.summaryBySite(a.id)
    expect(summary.map((s) => [s.site, s.alerts, s.jobsFound, s.lastAlertAt?.toISOString()])).toEqual([
      ['naukri', 2, 7, '2026-09-25T06:00:00.000Z'],
      ['bayt', 1, 2, '2026-09-22T06:00:00.000Z'],
    ])

    await emailAlertsQ.pruneOlderThan(a.id, at('23'))
    expect((await emailAlertsQ.summaryBySite(a.id)).map((s) => [s.site, s.alerts])).toEqual([['naukri', 1]])
    expect(await emailAlertsQ.summaryBySite(b.id)).toHaveLength(1)
  })
})
