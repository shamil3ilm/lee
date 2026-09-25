import { describe, it, expect, vi, beforeEach } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { accounts, discoveries, sources } from '@/lib/db/schema'
import { saveDiscovery } from '@/app/(authed)/discoveries/actions'
import * as discQ from '@/lib/db/queries/discoveries'
import * as stagesQ from '@/lib/db/queries/stages'
import { makeUser, makeCompany, makeJob, makeApplication } from '@/tests/factories'

// v9 — server-side execution guards. Two scenarios:
//   - discovery.save refuses when discovery.status has moved off 'new'
//   - push-to-calendar returns 409 when the stage state drifted since load

// Discovery guard tests use requireUserId → mock the whole session module.
const sessionMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/require-session', () => ({
  requireUserId: sessionMock,
}))

// revalidatePath needs Next's render context — server actions call it and
// throw outside of a real request. Stub it so we can drive actions from a
// vitest harness.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

// Push route tests need the real auth() mock too.
const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ auth: authMock }))

// Calendar adapter is mocked at the module boundary — we don't want the
// push route to actually try to hit Google. Return a fake event id when
// createEvent is called; not called in the drift tests.
// Note: shared vitest sessions (isolate=false) mean these mocks aren't a
// hard swap of the module; the "proceeds" test attaches a real accounts row
// and lets pushStageToCalendar's short-circuit on `googleEventId` skip the
// actual Google call.
const createEventMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/calendar/adapter', () => ({
  createEvent: createEventMock,
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}))

async function attachGoogleAccount(userId: string): Promise<void> {
  await db.insert(accounts).values({
    userId,
    type: 'oauth',
    provider: 'google',
    providerAccountId: `google-${userId}`,
    access_token: 'AT',
    refresh_token: 'RT',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'Bearer',
    scope: 'openid email calendar.events',
  })
}

async function seedDiscovery(userId: string): Promise<string> {
  const [src] = await db
    .insert(sources)
    .values({ userId, name: 'test', kind: 'greenhouse', config: {} })
    .returning()
  if (!src) throw new Error('failed to seed source')
  const { discovery } = await discQ.upsertBySource(
    userId,
    src.id,
    'gh-1',
    { id: 'gh-1' },
    {
      kind: 'job',
      title: 'Backend Engineer',
      companyName: 'Acme',
      companyDomain: 'acme.com',
      applyUrl: 'https://boards.greenhouse.io/acme/jobs/gh-1',
      descriptionMd: '',
      techStack: [],
      raw: {},
    },
  )
  return discovery.id
}

beforeEach(() => {
  sessionMock.mockReset()
  authMock.mockReset()
  createEventMock.mockReset()
})

describe('saveDiscovery execution guard', () => {
  it('returns conflict when the discovery is no longer new', async () => {
    const u = await makeUser('guard-save@x.com')
    const discoveryId = await seedDiscovery(u.id)
    // Simulate a background dismiss (another tab / cron).
    await db
      .update(discoveries)
      .set({ status: 'dismissed', updatedAt: new Date() })
      .where(and(eq(discoveries.userId, u.id), eq(discoveries.id, discoveryId)))

    sessionMock.mockResolvedValue(u.id)
    const result = await saveDiscovery(discoveryId)
    expect('conflict' in result).toBe(true)
    if ('conflict' in result) {
      expect(result.conflict).toBe('discovery_not_new')
      expect(result.currentStatus).toBe('dismissed')
    }
  })

  it('succeeds when the discovery is still new', async () => {
    const u = await makeUser('guard-save-ok@x.com')
    const discoveryId = await seedDiscovery(u.id)
    sessionMock.mockResolvedValue(u.id)
    const result = await saveDiscovery(discoveryId)
    expect('success' in result).toBe(true)
  })
})

describe('push-to-calendar execution guard', () => {
  it('returns 409 when the stage already has a googleEventId server-side', async () => {
    const u = await makeUser('guard-push-dup@x.com')
    const co = await makeCompany(u.id, { name: 'Acme' })
    const j = await makeJob(u.id, co.id)
    const app = await makeApplication(u.id, j.id)
    const stage = await stagesQ.create(u.id, app.id, {
      kind: 'tech_screen',
      title: null,
      scheduledAt: new Date('2026-10-01T10:00:00Z'),
      durationMinutes: 60,
      location: null,
      meetingUrl: null,
      prepNotesMd: null,
      status: 'scheduled',
    })
    // Simulate a parallel tab having already pushed.
    await stagesQ.update(u.id, stage.id, { googleEventId: 'existing-event-id' })

    authMock.mockResolvedValue({ user: { id: u.id } })
    const route = await import('@/app/api/stages/[id]/push-to-calendar/route')
    const res = await route.POST(
      new Request('http://localhost/x', {
        method: 'POST',
        body: JSON.stringify({
          expectedGoogleEventId: null,
          expectedScheduledAt: '2026-10-01T10:00:00.000Z',
        }),
      }),
      { params: Promise.resolve({ id: stage.id }) },
    )
    expect(res.status).toBe(409)
    const json = (await res.json()) as { conflict: string; message: string }
    expect(json.conflict).toBe('stage_event_drift')
    expect(json.message).toMatch(/already pushed/i)
  })

  it('returns 409 when scheduledAt drifted more than 6 hours', async () => {
    const u = await makeUser('guard-push-drift@x.com')
    const co = await makeCompany(u.id, { name: 'Acme' })
    const j = await makeJob(u.id, co.id)
    const app = await makeApplication(u.id, j.id)
    const stage = await stagesQ.create(u.id, app.id, {
      kind: 'tech_screen',
      title: null,
      scheduledAt: new Date('2026-10-02T10:00:00Z'),
      durationMinutes: 60,
      location: null,
      meetingUrl: null,
      prepNotesMd: null,
      status: 'scheduled',
    })

    authMock.mockResolvedValue({ user: { id: u.id } })
    const route = await import('@/app/api/stages/[id]/push-to-calendar/route')
    const res = await route.POST(
      new Request('http://localhost/x', {
        method: 'POST',
        body: JSON.stringify({
          expectedGoogleEventId: null,
          expectedScheduledAt: '2026-10-01T10:00:00.000Z',
        }),
      }),
      { params: Promise.resolve({ id: stage.id }) },
    )
    expect(res.status).toBe(409)
    const json = (await res.json()) as { conflict: string }
    expect(json.conflict).toBe('stage_reschedule_drift')
  })

  it('proceeds when expectations match current state', async () => {
    // Attach a real google account row so getGoogleTokens has data, and seed
    // the stage with an already-set googleEventId so pushStageToCalendar
    // short-circuits without calling the Google API — exactly the drift-free
    // idempotent path we care about testing.
    const u = await makeUser('guard-push-ok@x.com')
    await attachGoogleAccount(u.id)
    const co = await makeCompany(u.id, { name: 'Acme' })
    const j = await makeJob(u.id, co.id)
    const app = await makeApplication(u.id, j.id)
    const stage = await stagesQ.create(u.id, app.id, {
      kind: 'tech_screen',
      title: null,
      scheduledAt: new Date('2026-10-01T10:00:00Z'),
      durationMinutes: 60,
      location: null,
      meetingUrl: null,
      prepNotesMd: null,
      status: 'scheduled',
      googleEventId: 'seeded-event-id',
    })
    createEventMock.mockResolvedValue({ eventId: 'unused' })
    authMock.mockResolvedValue({ user: { id: u.id } })
    const route = await import('@/app/api/stages/[id]/push-to-calendar/route')
    const res = await route.POST(
      new Request('http://localhost/x', {
        method: 'POST',
        body: JSON.stringify({
          // Client believed the stage already had this event id → matches
          // server → no drift → route proceeds and returns the existing id.
          expectedGoogleEventId: 'seeded-event-id',
          expectedScheduledAt: '2026-10-01T10:00:00.000Z',
        }),
      }),
      { params: Promise.resolve({ id: stage.id }) },
    )
    expect(res.status).toBe(200)
    const json = (await res.json()) as { success: boolean; eventId: string }
    expect(json.success).toBe(true)
    expect(json.eventId).toBe('seeded-event-id')
  })
})
