import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { applicationContacts, discoveries, systemEvents, usageSettings, usageSnapshots } from '@/lib/db/schema'
import { clearThrottleCache, loadThrottleState } from '@/lib/usage/throttle'
import { utcPeriod } from '@/lib/usage/meters'
import { listEvents } from '@/lib/logs/queries'
import { getLastRuns, getRunHistory } from '@/lib/queue/runs'
import { claim, complete, enqueue } from '@/lib/queue/queue'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { warningsFor } from '@/lib/usage/alerts'
import { getStoragePageData } from '@/lib/usage/storage'
import * as benefitsQ from '@/lib/db/queries/discoveryBenefits'
import * as appContactsQ from '@/lib/db/queries/applicationContacts'
import { rateLimit } from '@/lib/tenancy/rate-limit'
import { EMPTY_SNAPSHOT_DATA } from '@/lib/usage/snapshot-data'
import {
  makeApplication,
  makeCompany,
  makeContact,
  makeDiscovery,
  makeJob,
  makeOwner,
  makeSource,
  makeUser,
} from '@/tests/factories'

/**
 * Two-user isolation (invite-beta audit §1, review P1-11): user B never
 * reads or changes user A's rows, and deployment-wide state (throttles,
 * usage, global logs and jobs, table sizes) is the owner's alone.
 */

const sessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-session', () => ({ requireUserId: sessionMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

const NOW = new Date()

beforeEach(() => {
  sessionMock.mockReset()
  clearThrottleCache()
})

async function pauseThrottleSnapshot() {
  await db.insert(usageSnapshots).values({ day: NOW.toISOString().slice(0, 10), data: {}, throttles: ['pause_nonessential'] })
}

describe('deployment throttle (review P1-11)', () => {
  it("a member's resume flag never lifts the deployment throttle; the owner's does", async () => {
    const owner = await makeOwner({ gmail: false })
    const member = await makeUser()
    await pauseThrottleSnapshot()
    await db.insert(usageSettings).values({ userId: member.id, throttlesResumedPeriod: utcPeriod(NOW) })
    expect((await loadThrottleState(NOW)).active.has('pause_nonessential')).toBe(true)
    await db.insert(usageSettings).values({ userId: owner.id, throttlesResumedPeriod: utcPeriod(NOW) })
    expect((await loadThrottleState(NOW)).active.has('pause_nonessential')).toBe(false)
  })

  it('usage actions refuse members and change nothing', async () => {
    await makeOwner({ gmail: false })
    const member = await makeUser()
    await pauseThrottleSnapshot()
    const actions = await import('@/app/(authed)/settings/usage/actions')
    sessionMock.mockResolvedValue(member.id)
    const refused = { error: 'Only the owner can change deployment usage settings.' }
    expect(await actions.setThrottlesResumedAction(true)).toEqual(refused)
    expect(await actions.saveNeonProjectAction('cool-sun-123456')).toEqual(refused)
    expect(await actions.refreshUsageAction()).toEqual(refused)
    expect(await db.select().from(usageSettings).where(eq(usageSettings.userId, member.id))).toEqual([])
    expect((await loadThrottleState(NOW)).active.has('pause_nonessential')).toBe(true)
  })
})

describe('logs and background jobs', () => {
  it('members see only their own events; global events are the owner’s', async () => {
    const owner = await makeOwner({ gmail: false })
    const a = await makeUser()
    const b = await makeUser()
    const ev = (userId: string | null, message: string) => ({ userId, level: 'warn', category: 'discovery', event: 'x', message })
    await db.insert(systemEvents).values([ev(a.id, 'A private'), ev(b.id, 'B private'), ev(null, 'global https://victim.example/jobs/1')])
    const msgs = async (userId: string) => (await listEvents(userId, { range: '24h' }, 1, NOW)).rows.map((r) => r.message).sort()
    expect(await msgs(a.id)).toEqual(['A private'])
    expect(await msgs(b.id)).toEqual(['B private'])
    expect(await msgs(owner.id)).toEqual(['global https://victim.example/jobs/1'])
  })

  it('members never see global jobs or another user’s runs', async () => {
    const owner = await makeOwner({ gmail: false })
    const a = await makeUser()
    const b = await makeUser()
    await enqueue(JOB_TYPES.followups, {}, { userId: a.id, runAfter: NOW })
    await enqueue(JOB_TYPES.followups, {}, { userId: b.id, runAfter: NOW })
    await enqueue(JOB_TYPES.reminders, {}, { runAfter: NOW })
    for (let i = 0; i < 3; i++) {
      const [job] = await claim(1, 'w', { now: NOW })
      await complete(job!.id, 'w', NOW, { durationMs: 5, summary: job!.type === JOB_TYPES.reminders ? { kind: 'reminders', added: 9 } : { kind: 'followups', nudged: 1 } })
    }
    const types = async (userId: string) => (await getLastRuns(userId, NOW)).filter((r) => r.last).map((r) => r.type).sort()
    expect(await types(a.id)).toEqual([JOB_TYPES.followups])
    expect(await types(owner.id)).toEqual([JOB_TYPES.reminders])
    expect(await getRunHistory(a.id, JOB_TYPES.reminders)).toEqual([])
    expect((await getRunHistory(a.id, JOB_TYPES.followups)).length).toBe(1)
  })
})

describe('usage and storage views', () => {
  it('deployment meters warn the owner only; members get their own budgets', () => {
    const data = {
      ...EMPTY_SNAPSHOT_DATA,
      readings: [{ id: 'neon_storage' as const, used: 480 * 1024 * 1024, source: 'measured' as const }],
    }
    expect(warningsFor(data, 'member', false)).toEqual([])
    expect(warningsFor(data, 'owner', true).map((w) => w.meter)).toEqual(['neon_storage'])
  })

  it('per-table sizes are shown to the owner only', async () => {
    const owner = await makeOwner({ gmail: false })
    const member = await makeUser()
    expect((await getStoragePageData(member.id)).tables).toEqual([])
    expect((await getStoragePageData(owner.id)).tables.length).toBeGreaterThan(0)
  })
})

describe('row isolation', () => {
  it('benefits backfill reads and writes only the caller’s rows', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const sa = await makeSource(a.id)
    const sb = await makeSource(b.id)
    const da = await makeDiscovery(a.id, sa.id)
    const db_ = await makeDiscovery(b.id, sb.id)
    expect((await benefitsQ.staleRows(a.id, 'k', 10)).map((r) => r.id)).toEqual([da.id])
    // A writes with B's row id: nothing changes for B.
    await benefitsQ.writeMany(a.id, [
      { id: db_.id, benefitsScore: 99, benefitsDetail: { hacked: true }, benefitsKey: 'k' },
      { id: da.id, benefitsScore: 10, benefitsDetail: { ok: true }, benefitsKey: 'k' },
    ])
    const [rb] = await db.select().from(discoveries).where(eq(discoveries.id, db_.id))
    const [ra] = await db.select().from(discoveries).where(eq(discoveries.id, da.id))
    expect(rb).toMatchObject({ benefitsScore: null, benefitsDetail: null, benefitsKey: null })
    expect(ra).toMatchObject({ benefitsScore: 10, benefitsKey: 'k' })
    expect(await benefitsQ.detailFor(a.id, db_.id)).toBeNull()
  })

  it('an application’s contacts never include another user’s contact', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const co = await makeCompany(a.id)
    const job = await makeJob(a.id, co.id)
    const app = await makeApplication(a.id, job.id)
    const mine = await makeContact(a.id, { name: 'Mine' })
    const theirs = await makeContact(b.id, { name: 'Theirs' })
    await appContactsQ.link(a.id, app.id, mine.id, 'recruiter')
    // A link row pointing at B's contact (bypassing link()'s checks) is ignored.
    await db.insert(applicationContacts).values({ applicationId: app.id, contactId: theirs.id, role: 'referrer' })
    expect((await appContactsQ.listForApplication(a.id, app.id)).map((c) => c.name)).toEqual(['Mine'])
    expect(await appContactsQ.listForApplication(b.id, app.id)).toEqual([])
  })

  it('rate limits are per user', async () => {
    const a = await makeUser()
    const b = await makeUser()
    for (let i = 0; i < 2; i++) expect((await rateLimit(a.id, 'iso', 2, 60, NOW)).allowed).toBe(true)
    expect((await rateLimit(a.id, 'iso', 2, 60, NOW)).allowed).toBe(false)
    expect((await rateLimit(b.id, 'iso', 2, 60, NOW)).allowed).toBe(true)
  })
})
