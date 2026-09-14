import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createStage, updateStage } from '@/lib/stages/service'
import { makeUser, makeCompany, makeJob, makeApplication } from '@/tests/factories'
import { db } from '@/lib/db/client'
import { activities, applications, interviewStages } from '@/lib/db/schema'

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
