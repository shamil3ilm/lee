import { describe, it, expect, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { createStage, deleteStage, updateStage } from '@/lib/stages/service'
import { makeUser, makeCompany, makeJob, makeApplication } from '@/tests/factories'
import { db } from '@/lib/db/client'
import { accounts, activities, applications, interviewStages } from '@/lib/db/schema'

const originalFetch = globalThis.fetch

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
    scope: 'calendar.events',
  })
}

afterEach(() => {
  ;(globalThis as { fetch: typeof fetch }).fetch = originalFetch
})

describe('createStage', () => {
  it('creates stage, bumps next_action_at, logs activity', async () => {
    const u = await makeUser()
    const c = await makeCompany(u.id)
    const j = await makeJob(u.id, c.id)
    const a = await makeApplication(u.id, j.id)

    const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const stage = await createStage({
      userId: u.id,
      applicationId: a.id,
      kind: 'phone_screen',
      title: 'Phone screen with recruiter',
      scheduledAt,
      durationMinutes: 30,
    })

    expect(stage.kind).toBe('phone_screen')

    const [app] = await db.select().from(applications).where(eq(applications.id, a.id))
    expect(app!.nextActionAt).toBeTruthy()
    expect(app!.nextActionAt!.getTime()).toBe(scheduledAt.getTime())

    const acts = await db.select().from(activities).where(eq(activities.applicationId, a.id))
    expect(acts.some((x) => x.kind === 'stage_added')).toBe(true)
  })

  it('does not bump next_action_at when new stage is later than existing', async () => {
    const u = await makeUser()
    const c = await makeCompany(u.id)
    const j = await makeJob(u.id, c.id)
    const earlier = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const later = new Date(Date.now() + 48 * 60 * 60 * 1000)
    const a = await makeApplication(u.id, j.id, { nextActionAt: earlier })

    await createStage({
      userId: u.id,
      applicationId: a.id,
      kind: 'onsite',
      scheduledAt: later,
    })

    const [app] = await db.select().from(applications).where(eq(applications.id, a.id))
    expect(app!.nextActionAt!.getTime()).toBe(earlier.getTime())
  })

  it('creates stage without scheduledAt (no next-action bump)', async () => {
    const u = await makeUser()
    const c = await makeCompany(u.id)
    const j = await makeJob(u.id, c.id)
    const a = await makeApplication(u.id, j.id)

    const stage = await createStage({
      userId: u.id,
      applicationId: a.id,
      kind: 'phone_screen',
    })
    expect(stage.scheduledAt).toBeNull()

    const [app] = await db.select().from(applications).where(eq(applications.id, a.id))
    expect(app!.nextActionAt).toBeNull()
  })
})

describe('createStage — calendar hook', () => {
  it('still saves the stage when calendar push throws', async () => {
    const u = await makeUser('cal-fail@x.com')
    await attachGoogleAccount(u.id)
    const c = await makeCompany(u.id)
    const j = await makeJob(u.id, c.id)
    const a = await makeApplication(u.id, j.id)

    // Force every fetch call to fail — token refresh and calendar create
    // would both blow up. The stage save must still succeed.
    ;(globalThis as { fetch: typeof fetch }).fetch = (async () =>
      new Response('boom', { status: 500 })) as unknown as typeof fetch

    const stage = await createStage({
      userId: u.id,
      applicationId: a.id,
      kind: 'phone_screen',
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })

    expect(stage.id).toBeTruthy()
    const [row] = await db
      .select()
      .from(interviewStages)
      .where(eq(interviewStages.id, stage.id))
    expect(row).toBeDefined()
    // Push failed — no googleEventId persisted.
    expect(row?.googleEventId).toBeNull()
  })

  it('is a no-op for calendar when the user has no google account', async () => {
    const u = await makeUser('no-google@x.com')
    const c = await makeCompany(u.id)
    const j = await makeJob(u.id, c.id)
    const a = await makeApplication(u.id, j.id)

    // No fetch should be issued because tokens can't be loaded.
    let fetches = 0
    ;(globalThis as { fetch: typeof fetch }).fetch = (async () => {
      fetches += 1
      return new Response('{}', { status: 200 })
    }) as unknown as typeof fetch

    const stage = await createStage({
      userId: u.id,
      applicationId: a.id,
      kind: 'phone_screen',
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    expect(stage.id).toBeTruthy()
    expect(fetches).toBe(0)
  })
})

describe('deleteStage', () => {
  it('removes the stage row', async () => {
    const u = await makeUser('del-stage@x.com')
    const c = await makeCompany(u.id)
    const j = await makeJob(u.id, c.id)
    const a = await makeApplication(u.id, j.id)
    const stage = await createStage({
      userId: u.id,
      applicationId: a.id,
      kind: 'phone_screen',
    })
    const ok = await deleteStage({ userId: u.id, id: stage.id })
    expect(ok).toBe(true)
    const rows = await db
      .select()
      .from(interviewStages)
      .where(eq(interviewStages.id, stage.id))
    expect(rows).toHaveLength(0)
  })
})

describe('updateStage', () => {
  it('updates stage without bumping next-action', async () => {
    const u = await makeUser()
    const c = await makeCompany(u.id)
    const j = await makeJob(u.id, c.id)
    const a = await makeApplication(u.id, j.id)

    const stage = await createStage({
      userId: u.id,
      applicationId: a.id,
      kind: 'phone_screen',
    })
    const updated = await updateStage({
      userId: u.id,
      id: stage.id,
      patch: { title: 'Updated title', durationMinutes: 45 },
    })
    expect(updated?.title).toBe('Updated title')
    expect(updated?.durationMinutes).toBe(45)

    const [rehydrated] = await db
      .select()
      .from(interviewStages)
      .where(eq(interviewStages.id, stage.id))
    expect(rehydrated!.title).toBe('Updated title')
  })
})
