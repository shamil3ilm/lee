import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The queue handlers import lib/ai; keep the Google SDK out of the module
// cache (see cron-sync-all.test.ts).
vi.mock('@/lib/ai', () => ({
  getAIProvider: () => ({}),
  getAIProviderForUser: async () => ({}),
  MODEL_REGISTRY: [],
  DEFAULT_MODEL_ID: 'gemini:gemini-2.0-flash',
  findModel: () => null,
}))
const sessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-session', () => ({ requireUserId: sessionMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { queueJobs, todos, usageAlerts, usageSettings, usageSnapshots } from '@/lib/db/schema'
import * as keysQ from '@/lib/db/queries/labProviderKeys'
import * as retention from '@/lib/db/retention'
import { appRegistry } from '@/lib/queue/handlers'
import { JOB_TYPES } from '@/lib/queue/job-types'
import { enqueue } from '@/lib/queue/queue'
import { createRegistry, defineHandler } from '@/lib/queue/registry'
import { scheduleVisitDrain } from '@/lib/queue/visit'
import { scheduleDailyJobs } from '@/lib/queue/scheduler'
import * as collect from '@/lib/usage/collect'
import { usageWarningsForUser } from '@/lib/usage/alerts'
import { getUsagePageData } from '@/lib/usage/page-data'
import { latestSnapshot, takeUsageSnapshot } from '@/lib/usage/snapshot'
import { clearThrottleCache, loadThrottleState } from '@/lib/usage/throttle'
import { gatherPipelineSnapshot } from '@/lib/digest/weekly'
import { renderWeeklyDigestHtml } from '@/lib/digest/email-template'
import {
  refreshUsageAction,
  saveNeonProjectAction,
  setThrottlesResumedAction,
} from '@/app/(authed)/settings/usage/actions'
import { saveServiceSecretAction, testServiceSecretAction } from '@/app/(authed)/settings/ai/actions'
import { GET as discoverGET } from '@/app/api/cron/discover/route'
import { env } from '@/lib/env'
import type { ClaimedJob } from '@/lib/queue/types'
import { makeUser } from '@/tests/factories'

const GB = 1024 ** 3
const NEON_KEY = 'napi_test_key_1234567890'

interface NeonStub {
  projects?: { id: string }[]
  project?: Record<string, unknown>
  status?: number
}

function stubNeon(opts: NeonStub = {}) {
  const fn = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input)
    if (!url.startsWith('https://console.neon.tech/api/v2/')) throw new Error(`unexpected fetch ${url}`)
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${NEON_KEY}`)
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    if (opts.status) return new Response('{"message":"secret upstream detail"}', { status: opts.status })
    if (url.includes('/projects?limit=')) {
      return Response.json({ projects: opts.projects ?? [{ id: 'proj-one' }] })
    }
    if (url.endsWith('/endpoints')) {
      return Response.json({ endpoints: [{ type: 'read_write', current_state: 'idle' }] })
    }
    const id = url.split('/projects/')[1] ?? ''
    return Response.json({
      project: {
        id,
        compute_time_seconds: 36 * 3600,
        data_transfer_bytes: GB,
        synthetic_storage_size: 30_000_000,
        consumption_period_start: '2026-09-01T00:00:00Z',
        consumption_period_end: '2026-10-01T00:00:00Z',
        ...opts.project,
      },
    })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

function forbidFetch() {
  const fn = vi.fn(async () => {
    throw new Error('no vendor call expected')
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

const savedEnv = process.env.NEON_API_KEY
beforeEach(() => {
  sessionMock.mockReset()
  delete process.env.NEON_API_KEY
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  if (savedEnv === undefined) delete process.env.NEON_API_KEY
  else process.env.NEON_API_KEY = savedEnv
})

function job(type: string, userId: string | null, attempts = 1): ClaimedJob {
  return { id: crypto.randomUUID(), userId, type, payload: {}, attempts, maxAttempts: 5, createdAt: new Date() }
}

async function runHandler(type: string, j: ClaimedJob) {
  const h = appRegistry.get(type)
  if (!h) throw new Error(`no handler ${type}`)
  return h.execute({ job: j, deadline: Date.now() + 10_000, signal: new AbortController().signal })
}

describe('takeUsageSnapshot', () => {
  it('without a Neon key: measures the DB, calls no vendor API, stores one row per day', async () => {
    const fetchMock = forbidFetch()
    const u = await makeUser()
    const now = new Date('2026-09-26T09:00:00Z')
    const r = await takeUsageSnapshot(now)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(r).toMatchObject({ day: '2026-09-26', throttles: [], todosCreated: 0, neonConnected: false })

    const snap = await latestSnapshot()
    const by = Object.fromEntries((snap?.data.readings ?? []).map((x) => [x.id, x]))
    expect(by.neon_storage?.source).toBe('measured')
    expect(by.neon_storage?.used).toBeGreaterThan(0)
    expect(by.neon_compute).toEqual({ id: 'neon_compute', used: null, source: 'unavailable' })
    expect(by.vercel_active_cpu?.source).toBe('vendor_dashboard')
    expect(snap?.data.userReadings[u.id]).toEqual([{ id: 'asset_storage', used: 0, source: 'measured' }])
    expect(snap?.data.largestTables.length).toBeGreaterThan(0)
    expect(snap?.data.neon.error).toBeNull()

    await takeUsageSnapshot(new Date('2026-09-26T15:00:00Z'))
    expect(await db.select().from(usageSnapshots)).toHaveLength(1)
  })

  it('with a saved Neon key: reads CU-hours, egress and compute state from the API', async () => {
    const u = await makeUser()
    await keysQ.upsert(u.id, 'neon', NEON_KEY)
    const fetchMock = stubNeon()
    await takeUsageSnapshot(new Date('2026-09-26T09:00:00Z'))
    const snap = await latestSnapshot()
    const by = Object.fromEntries((snap?.data.readings ?? []).map((x) => [x.id, x]))
    expect(by.neon_compute).toEqual({ id: 'neon_compute', used: 36, source: 'neon_api' })
    expect(by.neon_egress).toEqual({ id: 'neon_egress', used: GB, source: 'neon_api' })
    expect(snap?.data.neon).toMatchObject({ connected: true, computeState: 'idle', error: null })
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls).toContain('https://console.neon.tech/api/v2/projects?limit=2')
    expect(urls).toContain('https://console.neon.tech/api/v2/projects/proj-one')
  })

  it('uses the saved project id and the env key fallback', async () => {
    const u = await makeUser()
    process.env.NEON_API_KEY = NEON_KEY
    await db.insert(usageSettings).values({ userId: u.id, neonProjectId: 'my-proj-42' })
    const fetchMock = stubNeon({ projects: [{ id: 'a' }, { id: 'b' }] })
    await takeUsageSnapshot()
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls).not.toContain('https://console.neon.tech/api/v2/projects?limit=2')
    expect(urls).toContain('https://console.neon.tech/api/v2/projects/my-proj-42')
  })

  it('a rejected key or several projects is a friendly note, never upstream text', async () => {
    const u = await makeUser()
    await keysQ.upsert(u.id, 'neon', NEON_KEY)
    stubNeon({ status: 401 })
    await takeUsageSnapshot()
    let snap = await latestSnapshot()
    expect(snap?.data.neon).toMatchObject({ connected: false, error: 'Neon rejected the API key.' })
    expect(JSON.stringify(snap?.data)).not.toContain('secret upstream detail')
    expect(JSON.stringify(snap?.data)).not.toContain(NEON_KEY)

    stubNeon({ projects: [{ id: 'a' }, { id: 'b' }] })
    await takeUsageSnapshot()
    snap = await latestSnapshot()
    expect(snap?.data.neon.error).toMatch(/several projects/)
  })

  it('at ≥90 % CU-hours turns on the pause throttle; the owner can resume it for the month', async () => {
    const u = await makeUser()
    await keysQ.upsert(u.id, 'neon', NEON_KEY)
    stubNeon({ project: { compute_time_seconds: 92 * 3600 } })
    const r = await takeUsageSnapshot()
    expect(r.throttles).toEqual(['pause_nonessential'])
    expect((await loadThrottleState()).active.has('pause_nonessential')).toBe(true)

    // Non-essential jobs skip; essentials (reminders) are untouched.
    const scam = await runHandler(JOB_TYPES.scamReassess, job(JOB_TYPES.scamReassess, u.id))
    expect(scam.metrics).toEqual({ scam_reassess_paused_by_usage: 1 })
    const retry = await runHandler(
      JOB_TYPES.discoverySource,
      { ...job(JOB_TYPES.discoverySource, u.id, 2), payload: { sourceId: crypto.randomUUID() } },
    )
    expect(retry.metrics).toEqual({ discovery_paused_by_usage: 1 })
    const reminders = await runHandler(JOB_TYPES.reminders, job(JOB_TYPES.reminders, null))
    expect(reminders.metrics).toHaveProperty('reminders_added')

    // The manual discovery endpoint stops polling.
    const res = await discoverGET(
      new Request('http://localhost/api/cron/discover', {
        headers: { authorization: `Bearer ${env.CRON_SECRET}` },
      }) as never,
    )
    expect(await res.json()).toEqual({ skipped: 'paused_by_usage' })

    sessionMock.mockResolvedValue(u.id)
    expect(await setThrottlesResumedAction(true)).toMatchObject({ success: true })
    const resumed = await loadThrottleState()
    expect(resumed.active.has('pause_nonessential')).toBe(false)
    expect(resumed.requested.has('pause_nonessential')).toBe(true)
    const scamAgain = await runHandler(JOB_TYPES.scamReassess, job(JOB_TYPES.scamReassess, u.id))
    expect(scamAgain.metrics).toHaveProperty('scam_reassessed')

    expect(await setThrottlesResumedAction(false)).toMatchObject({ success: true })
    expect((await loadThrottleState()).active.has('pause_nonessential')).toBe(true)
  })

  it('the pause skips opportunistic page-visit drains', async () => {
    const u = await makeUser()
    await db.insert(usageSnapshots).values({
      day: new Date().toISOString().slice(0, 10),
      data: {},
      throttles: ['pause_nonessential'],
    })
    clearThrottleCache()
    const ran: string[] = []
    const registry = createRegistry([
      defineHandler({
        type: 'user-task',
        scope: 'user',
        payload: z.object({}),
        timeoutMs: 5_000,
        async run() {
          ran.push('x')
        },
      }),
    ])
    await enqueue('user-task', {}, { userId: u.id })
    await scheduleVisitDrain(u.id, { registry })
    expect(ran).toEqual([])
    const [row] = await db.select().from(queueJobs).where(eq(queueJobs.userId, u.id))
    expect(row?.status).toBe('queued')
  })

  it('at ≥90 % storage runs retention early', async () => {
    await makeUser()
    vi.spyOn(collect, 'collectMeasurements').mockResolvedValue({
      dbSizeBytes: 0.46 * GB,
      largestTables: [],
      queue: { backlog: 0, dead: 0, doneRecent: 0 },
      assetBytes: new Map(),
    })
    const spy = vi.spyOn(retention, 'runRetention').mockResolvedValue({
      tombstonedDiscoveries: 0,
      aiCallLogs: 0,
      gmailThreads: 0,
      compactedDiscoveries: 0,
      queueJobs: 0,
    })
    const r = await takeUsageSnapshot()
    expect(r.throttles).toEqual(['early_retention'])
    expect(r.retentionRan).toBe(true)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('warnings', () => {
  function measure(dbFraction: number, assetBytes = new Map<string, number>()) {
    vi.spyOn(collect, 'collectMeasurements').mockResolvedValue({
      dbSizeBytes: dbFraction * 0.5 * GB,
      largestTables: [],
      queue: { backlog: 0, dead: 0, doneRecent: 0 },
      assetBytes,
    })
  }

  it('one todo per meter per threshold per month, idempotent across refreshes', async () => {
    const u = await makeUser()
    measure(0.75)
    const now = new Date('2026-09-10T09:00:00Z')
    expect((await takeUsageSnapshot(now)).todosCreated).toBe(1)
    expect((await takeUsageSnapshot(now)).todosCreated).toBe(0)
    let list = await db.select().from(todos).where(eq(todos.userId, u.id))
    expect(list).toHaveLength(1)
    expect(list[0]?.title).toBe('Free tier: Database storage at 75%')
    expect(list[0]?.tags).toEqual(['free-tier'])

    vi.restoreAllMocks()
    measure(0.93)
    vi.spyOn(retention, 'runRetention').mockResolvedValue({
      tombstonedDiscoveries: 0, aiCallLogs: 0, gmailThreads: 0, compactedDiscoveries: 0, queueJobs: 0,
    })
    expect((await takeUsageSnapshot(new Date('2026-09-11T09:00:00Z'))).todosCreated).toBe(1)
    list = await db.select().from(todos).where(eq(todos.userId, u.id))
    expect(list.map((t) => t.priority).sort()).toEqual([2, 3])

    // A new month warns again.
    expect((await takeUsageSnapshot(new Date('2026-10-01T09:00:00Z'))).todosCreated).toBe(1)
    const alerts = await db.select().from(usageAlerts).where(eq(usageAlerts.userId, u.id))
    expect(alerts.map((a) => `${a.period}:${a.threshold}`).sort()).toEqual([
      '2026-09:70',
      '2026-09:90',
      '2026-10:70',
      '2026-10:90',
    ])
  })

  it('jumping straight to 90 % records 70 too, with a single todo', async () => {
    const u = await makeUser()
    measure(0.1, new Map([[u.id, 140 * 1024 * 1024]]))
    const r = await takeUsageSnapshot(new Date('2026-09-10T09:00:00Z'))
    expect(r.todosCreated).toBe(1)
    const alerts = await db.select().from(usageAlerts).where(eq(usageAlerts.userId, u.id))
    expect(alerts.map((a) => a.threshold).sort()).toEqual([70, 90])
    expect(alerts.filter((a) => a.todoId !== null)).toHaveLength(1)
  })

  it('banner/digest warnings come from this month’s latest snapshot only', async () => {
    const u = await makeUser()
    measure(0.8)
    await takeUsageSnapshot(new Date('2026-08-31T09:00:00Z'))
    expect(await usageWarningsForUser(u.id, new Date('2026-09-01T10:00:00Z'))).toEqual([])
    await takeUsageSnapshot(new Date('2026-09-01T09:00:00Z'))
    const w = await usageWarningsForUser(u.id, new Date('2026-09-01T10:00:00Z'))
    expect(w).toEqual([expect.objectContaining({ meter: 'neon_storage', threshold: 70 })])
  })

  it('the weekly digest includes the warnings', async () => {
    const u = await makeUser()
    measure(0.8)
    await takeUsageSnapshot()
    const snap = await gatherPipelineSnapshot(u.id)
    expect(snap.usageWarnings?.map((w) => w.meter)).toEqual(['neon_storage'])
    const html = renderWeeklyDigestHtml(snap)
    expect(html).toContain('Free-tier usage')
    expect(html).toContain('Database storage')
    expect(html).toContain('/settings/usage')
  })
})

describe('scheduler', () => {
  it('enqueues one usage snapshot per day', async () => {
    await makeUser()
    await scheduleDailyJobs(new Date('2026-09-26T09:00:00Z'))
    await scheduleDailyJobs(new Date('2026-09-26T21:00:00Z'))
    const rows = await db.select().from(queueJobs).where(eq(queueJobs.type, JOB_TYPES.usageSnapshot))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ userId: null, idempotencyKey: 'usage-snapshot:all:2026-09-26' })
  })

  it('the snapshot handler reports counts only', async () => {
    forbidFetch()
    const r = await runHandler(JOB_TYPES.usageSnapshot, job(JOB_TYPES.usageSnapshot, null))
    expect(r.metrics).toEqual({ usage_snapshots: 1, usage_todos_created: 0, usage_throttles: 0 })
  })
})

describe('Settings › Usage', () => {
  it('page data before any snapshot: live DB size, no vendor call, no key', async () => {
    const fetchMock = forbidFetch()
    const u = await makeUser()
    const d = await getUsagePageData(u.id)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(d.snapshotAt).toBeNull()
    const by = Object.fromEntries(d.meters.map((m) => [m.id, m]))
    expect(by.neon_storage?.used).toBeGreaterThan(0)
    expect(by.neon_storage?.sourceLabel).toBe('Measured')
    expect(by.asset_storage?.used).toBe(0)
    expect(by.neon_compute?.used).toBeNull()
    expect(by.vercel_active_cpu?.sourceLabel).toMatch(/Not available on Hobby/)
    expect(d.neon.keySource).toBe('none')
    expect(d.throttles.every((t) => !t.requested)).toBe(true)
    expect(d.refreshAvailableAt).toBeNull()
    expect(JSON.stringify(d)).not.toContain('napi_')
  })

  it('Refresh now is throttled per user', async () => {
    forbidFetch()
    const u = await makeUser()
    sessionMock.mockResolvedValue(u.id)
    expect(await refreshUsageAction()).toEqual({ success: true, message: 'Usage refreshed.' })
    const again = await refreshUsageAction()
    expect(again).toHaveProperty('error')
    expect((await getUsagePageData(u.id)).refreshAvailableAt).not.toBeNull()
  })

  it('Refresh failures stay friendly', async () => {
    const u = await makeUser()
    sessionMock.mockResolvedValue(u.id)
    vi.spyOn(collect, 'collectMeasurements').mockRejectedValue(new Error('relation "x" does not exist'))
    expect(await refreshUsageAction()).toEqual({ error: 'Could not refresh usage right now.' })
  })

  it('validates and saves the Neon project id', async () => {
    const u = await makeUser()
    sessionMock.mockResolvedValue(u.id)
    expect(await saveNeonProjectAction('DROP TABLE users')).toHaveProperty('error')
    expect(await saveNeonProjectAction('cool-sun-123456')).toMatchObject({ success: true })
    const [s] = await db.select().from(usageSettings).where(eq(usageSettings.userId, u.id))
    expect(s?.neonProjectId).toBe('cool-sun-123456')
    expect(await saveNeonProjectAction('')).toMatchObject({ success: true })
    const [cleared] = await db.select().from(usageSettings).where(eq(usageSettings.userId, u.id))
    expect(cleared?.neonProjectId).toBeNull()
  })
})

describe('Neon service key', () => {
  it('is checked against the Neon API before it is stored; a rejected key is not saved', async () => {
    const u = await makeUser()
    sessionMock.mockResolvedValue(u.id)
    stubNeon({ status: 401 })
    expect(await saveServiceSecretAction('neon', NEON_KEY)).toEqual({ error: 'Neon rejected the API key.' })
    expect(await keysQ.getDecrypted(u.id, 'neon')).toBeNull()

    const fetchMock = stubNeon()
    expect(await saveServiceSecretAction('neon', NEON_KEY)).toEqual({
      success: true,
      last4: NEON_KEY.slice(-4),
      verified: true,
      warning: null,
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://console.neon.tech/api/v2/projects?limit=1')
    expect(await testServiceSecretAction('neon')).toEqual({ ok: true, error: null })
  })
})
