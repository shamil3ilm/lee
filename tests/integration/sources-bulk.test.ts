import { beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { queueJobs, sources } from '@/lib/db/schema'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { RATE_LIMITS, actionKey } from '@/lib/tenancy/rate-limit'
import { checkSourcesNow, setSourcesEnabled, setWatchReminders } from '@/app/(authed)/settings/sources/bulk-actions'
import { makeSource, makeUser } from '@/tests/factories'

const sessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-session', () => ({ requireUserId: sessionMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

beforeEach(() => sessionMock.mockReset())

async function enabledOf(ids: readonly string[]): Promise<Record<string, boolean>> {
  const rows = await db.select({ id: sources.id, enabled: sources.enabled }).from(sources).where(inArray(sources.id, [...ids]))
  return Object.fromEntries(rows.map((r) => [r.id, r.enabled]))
}

async function pendingPolls(userId: string): Promise<Array<{ sourceId: string; status: string }>> {
  const rows = await db
    .select({ payload: queueJobs.payload, status: queueJobs.status })
    .from(queueJobs)
    .where(and(eq(queueJobs.userId, userId), eq(queueJobs.type, JOB_TYPES.discoverySource)))
  return rows.map((r) => ({ sourceId: String((r.payload as { sourceId?: string }).sourceId), status: r.status }))
}

async function board(userId: string, name: string, over: Partial<typeof sources.$inferInsert> = {}) {
  return makeSource(userId, { name, kind: 'greenhouse', config: { company: name.toLowerCase() }, enabled: false, ...over })
}

describe('setSourcesEnabled', () => {
  it("turns the user's own sources on in one go and ignores another user's id", async () => {
    const me = await makeUser()
    const other = await makeUser()
    const a = await board(me.id, 'Alpha')
    const b = await board(me.id, 'Beta')
    const theirs = await board(other.id, 'Theirs')
    sessionMock.mockResolvedValue(me.id)

    const r = await setSourcesEnabled([a.id, b.id, theirs.id], true)
    expect(r).toMatchObject({ success: true })
    expect(await enabledOf([a.id, b.id, theirs.id])).toEqual({ [a.id]: true, [b.id]: true, [theirs.id]: false })
    // Polls queued for my two sources only, none for the other user.
    expect((await pendingPolls(me.id)).map((p) => p.sourceId).sort()).toEqual([a.id, b.id].sort())
    expect(await pendingPolls(other.id)).toEqual([])
  })

  it('queues one poll per source: a second Turn on, Check now or an older pending poll never adds another', async () => {
    const me = await makeUser()
    const s = await Promise.all(['A', 'B', 'C', 'D', 'E'].map((n) => board(me.id, `Board ${n}`)))
    const ids = s.map((x) => x.id)
    sessionMock.mockResolvedValue(me.id)
    // One source already has a poll pending from an earlier day (a backlog).
    await db.insert(queueJobs).values({
      type: JOB_TYPES.discoverySource,
      userId: me.id,
      payload: { sourceId: ids[0] },
      idempotencyKey: `discovery-source:${me.id}:${ids[0]}:2026-01-01`,
      coalesceKey: `${me.id}:${ids[0]}`,
      runAfter: new Date(Date.now() + 86_400_000),
    })

    const first = await setSourcesEnabled(ids, true)
    expect(first).toEqual({ success: true, message: 'Turned on 5 sources · 5 checks queued, the first 3 running now' })
    expect(await setSourcesEnabled(ids, true)).toEqual({ success: true, message: 'Turned on 0 sources' })
    expect(await checkSourcesNow(ids)).toEqual({ success: true, message: '5 sources: already queued: 5 checks, one per source' })

    const polls = await pendingPolls(me.id)
    expect(polls).toHaveLength(5)
    expect(new Set(polls.map((p) => p.sourceId))).toEqual(new Set(ids))
    expect(polls.every((p) => p.status === 'queued')).toBe(true)
    // The older pending poll was pulled forward to now, not duplicated.
    const [old] = await db
      .select({ runAfter: queueJobs.runAfter })
      .from(queueJobs)
      .where(sql`${queueJobs.payload}->>'sourceId' = ${ids[0]}`)
    expect(old!.runAfter.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('skips sources that need setup lee does not have, and says so', async () => {
    const me = await makeUser()
    const adzuna = await makeSource(me.id, { name: 'Adzuna', kind: 'adzuna', config: {}, enabled: false })
    const alerts = await makeSource(me.id, { name: 'Alerts', kind: 'email_alert', config: {}, enabled: false })
    const ok = await board(me.id, 'Ok')
    sessionMock.mockResolvedValue(me.id)

    const r = await setSourcesEnabled([adzuna.id, alerts.id, ok.id], true)
    expect(r).toEqual({ success: true, message: 'Turned on 1 source · 1 check queued, running now · 2 skipped (needs setup)' })
    expect(await enabledOf([adzuna.id, alerts.id, ok.id])).toEqual({ [adzuna.id]: false, [alerts.id]: false, [ok.id]: true })
    expect((await pendingPolls(me.id)).map((p) => p.sourceId)).toEqual([ok.id])
  })

  it('turns sources off without queuing anything, and never touches watch links', async () => {
    const me = await makeUser()
    const on = await board(me.id, 'On', { enabled: true })
    const watch = await makeSource(me.id, { name: 'Watch', kind: 'watch', config: { url: 'https://x.example/jobs' }, enabled: true })
    sessionMock.mockResolvedValue(me.id)

    expect(await setSourcesEnabled([on.id, watch.id], false)).toEqual({ success: true, message: 'Turned off 1 source' })
    expect(await enabledOf([on.id, watch.id])).toEqual({ [on.id]: false, [watch.id]: true })
    expect(await pendingPolls(me.id)).toEqual([])
  })

  it('validates the input', async () => {
    const me = await makeUser()
    sessionMock.mockResolvedValue(me.id)
    expect(await setSourcesEnabled([], true)).toEqual({ error: 'Select between 1 and 500 sources.' })
    expect(await setSourcesEnabled(['not-a-uuid'], true)).toEqual({ error: 'Select between 1 and 500 sources.' })
    expect(await setSourcesEnabled([crypto.randomUUID()], 'yes' as unknown as boolean)).toEqual({ error: 'Select between 1 and 500 sources.' })
  })

  it('is rate limited per user through action_throttle', async () => {
    const me = await makeUser()
    const other = await makeUser()
    const mine = await board(me.id, 'Mine')
    const theirs = await board(other.id, 'Theirs')
    await db.execute(sql`
      insert into action_throttle (user_id, action, window_start, count)
      values (${me.id}::uuid, ${actionKey('sourceBulk')}, now(), ${RATE_LIMITS.sourceBulk.limit})
    `)
    sessionMock.mockResolvedValue(me.id)
    const r = await setSourcesEnabled([mine.id], true)
    expect(r).toMatchObject({ error: expect.stringContaining("You've reached the limit for changing many sources at once") })
    expect(await checkSourcesNow([mine.id])).toMatchObject({ error: expect.stringContaining('reached the limit') })
    expect(await enabledOf([mine.id])).toEqual({ [mine.id]: false })
    expect(await pendingPolls(me.id)).toEqual([])

    // Another user is not affected.
    sessionMock.mockResolvedValue(other.id)
    expect(await setSourcesEnabled([theirs.id], true)).toMatchObject({ success: true })
  })

  it('counts one use per click, and an invalid request uses none', async () => {
    const me = await makeUser()
    const s = await board(me.id, 'Counted')
    sessionMock.mockResolvedValue(me.id)
    await setSourcesEnabled([], true)
    await setSourcesEnabled([s.id], true)
    const result = await db.execute(sql`select count from action_throttle where user_id = ${me.id}::uuid and action = ${actionKey('sourceBulk')}`)
    const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as Array<{ count: number }>
    expect(Number(rows[0]?.count)).toBe(1)
  })
})

describe('checkSourcesNow', () => {
  it('queues polls only for sources that are on, and only once an hour', async () => {
    const me = await makeUser()
    const on = await board(me.id, 'On', { enabled: true, lastPolledAt: new Date() })
    const off = await board(me.id, 'Off')
    sessionMock.mockResolvedValue(me.id)

    expect(await checkSourcesNow([on.id, off.id])).toEqual({ success: true, message: '1 source: 1 check queued, running now' })
    expect((await pendingPolls(me.id)).map((p) => p.sourceId)).toEqual([on.id])
    // Already pending: merged, not a second job.
    expect(await checkSourcesNow([on.id])).toEqual({ success: true, message: '1 source: already queued: 1 check, one per source' })
    // Done within the hour: nothing new until the next hour.
    await db.update(queueJobs).set({ status: 'done' }).where(eq(queueJobs.userId, me.id))
    expect(await checkSourcesNow([on.id])).toEqual({ success: true, message: '1 source: already checked this hour' })
    expect(await pendingPolls(me.id)).toHaveLength(1)
    expect(await checkSourcesNow([off.id])).toEqual({ success: true, message: 'Nothing to check: turn the sources on first' })
  })
})

describe('setWatchReminders', () => {
  it("switches weekly reminders on the user's own watch links only, keeping their other config", async () => {
    const me = await makeUser()
    const other = await makeUser()
    const w1 = await makeSource(me.id, { name: 'W1', kind: 'watch', enabled: false, config: { url: 'https://a.example', reason: 'terms' } })
    const w2 = await makeSource(me.id, { name: 'W2', kind: 'watch', enabled: false, config: { url: 'https://b.example', watching: true } })
    const polled = await board(me.id, 'Polled')
    const theirs = await makeSource(other.id, { name: 'T', kind: 'watch', enabled: false, config: { url: 'https://c.example' } })
    sessionMock.mockResolvedValue(me.id)

    const r = await setWatchReminders([w1.id, w2.id, polled.id, theirs.id], false)
    expect(r).toEqual({ success: true, message: 'Weekly reminders off for 2 links' })
    const rows = await db.select({ id: sources.id, config: sources.config }).from(sources).where(inArray(sources.id, [w1.id, w2.id, polled.id, theirs.id]))
    const config = Object.fromEntries(rows.map((x) => [x.id, x.config]))
    expect(config[w1.id]).toEqual({ url: 'https://a.example', reason: 'terms', watching: false })
    expect(config[w2.id]).toEqual({ url: 'https://b.example', watching: false })
    expect(config[polled.id]).toEqual({ company: 'polled' })
    expect(config[theirs.id]).toEqual({ url: 'https://c.example' })

    expect(await setWatchReminders([w1.id], true)).toEqual({ success: true, message: 'Weekly reminders on for 1 link' })
  })
})
