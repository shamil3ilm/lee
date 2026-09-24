import { describe, it, expect } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { accounts, interviewStages, userProfile } from '@/lib/db/schema'
import {
  deleteStageEvent,
  pushStageToCalendar,
  updateStageEvent,
} from '@/lib/calendar/service'
import * as applications from '@/lib/db/queries/applications'
import * as companies from '@/lib/db/queries/companies'
import * as jobs from '@/lib/db/queries/jobs'
import * as stagesQ from '@/lib/db/queries/stages'
import { makeUser } from '@/tests/factories'

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

async function seed(email = 'cal@x.com') {
  const u = await makeUser(email)
  await attachGoogleAccount(u.id)
  const co = await companies.findOrCreateByDomain(u.id, 'cal.co', 'Cal Co')
  const j = await jobs.upsertBySourceUrl(u.id, co.id, {
    title: 'Senior Engineer',
    sourceUrl: `https://cal.co/j/${email}`,
  })
  const app = await applications.create(u.id, { jobId: j.id })
  return { u, app, co, j }
}

describe('calendar service', () => {
  it('pushStageToCalendar creates event, saves googleEventId, updates syncedCalendarAt', async () => {
    const { u, app } = await seed('push@x.com')
    const scheduled = new Date('2026-11-01T10:00:00.000Z')
    const stage = await stagesQ.create(u.id, app.id, {
      kind: 'video',
      title: 'Loop 1',
      scheduledAt: scheduled,
      durationMinutes: 45,
      meetingUrl: 'https://meet.google.com/abc',
    })

    let capturedEvent: unknown
    const result = await pushStageToCalendar({
      userId: u.id,
      stageId: stage.id,
      adapters: {
        createEvent: async ({ event }) => {
          capturedEvent = event
          return { eventId: 'evt_new' }
        },
      },
    })

    expect(result).toEqual({ eventId: 'evt_new' })
    const persisted = await db.query.interviewStages.findFirst({
      where: and(eq(interviewStages.userId, u.id), eq(interviewStages.id, stage.id)),
    })
    expect(persisted?.googleEventId).toBe('evt_new')

    const profile = await db.query.userProfile.findFirst({
      where: eq(userProfile.userId, u.id),
    })
    expect(profile?.syncedCalendarAt).toBeInstanceOf(Date)

    const ev = capturedEvent as {
      summary: string
      location: string
      start: { dateTime: string; timeZone: string }
      end: { dateTime: string; timeZone: string }
    }
    expect(ev.summary).toBe('Interview: Senior Engineer @ Cal Co')
    expect(ev.location).toBe('https://meet.google.com/abc')
    expect(ev.start.timeZone).toBe('Asia/Dubai')
    // End should be scheduled + 45min.
    const end = new Date(ev.end.dateTime)
    expect(end.getTime() - scheduled.getTime()).toBe(45 * 60_000)
  })

  it('pushStageToCalendar is idempotent when a googleEventId already exists', async () => {
    const { u, app } = await seed('idem@x.com')
    const stage = await stagesQ.create(u.id, app.id, {
      kind: 'video',
      scheduledAt: new Date('2026-11-02T10:00:00.000Z'),
    })
    // Manually stamp an eventId.
    await stagesQ.update(u.id, stage.id, { googleEventId: 'evt_existing' })

    let calls = 0
    const result = await pushStageToCalendar({
      userId: u.id,
      stageId: stage.id,
      adapters: {
        createEvent: async () => {
          calls += 1
          return { eventId: 'evt_should_not_be_used' }
        },
      },
    })
    expect(result.eventId).toBe('evt_existing')
    expect(calls).toBe(0)
  })

  it('updateStageEvent PATCHes the existing event', async () => {
    const { u, app } = await seed('upd@x.com')
    const stage = await stagesQ.create(u.id, app.id, {
      kind: 'video',
      scheduledAt: new Date('2026-11-03T10:00:00.000Z'),
    })
    await stagesQ.update(u.id, stage.id, { googleEventId: 'evt_up' })

    let patched = false
    let receivedId: string | undefined
    await updateStageEvent({
      userId: u.id,
      stageId: stage.id,
      adapters: {
        updateEvent: async ({ eventId }) => {
          patched = true
          receivedId = eventId
        },
      },
    })
    expect(patched).toBe(true)
    expect(receivedId).toBe('evt_up')
  })

  it('updateStageEvent is a no-op when the stage has no googleEventId', async () => {
    const { u, app } = await seed('upd2@x.com')
    const stage = await stagesQ.create(u.id, app.id, {
      kind: 'video',
      scheduledAt: new Date('2026-11-04T10:00:00.000Z'),
    })
    let called = false
    await updateStageEvent({
      userId: u.id,
      stageId: stage.id,
      adapters: {
        updateEvent: async () => {
          called = true
        },
      },
    })
    expect(called).toBe(false)
  })

  it('deleteStageEvent removes the event and nulls googleEventId', async () => {
    const { u, app } = await seed('del@x.com')
    const stage = await stagesQ.create(u.id, app.id, {
      kind: 'video',
      scheduledAt: new Date('2026-11-05T10:00:00.000Z'),
    })
    await stagesQ.update(u.id, stage.id, { googleEventId: 'evt_del' })

    let deletedId: string | undefined
    await deleteStageEvent({
      userId: u.id,
      stageId: stage.id,
      adapters: {
        deleteEvent: async ({ eventId }) => {
          deletedId = eventId
        },
      },
    })
    expect(deletedId).toBe('evt_del')

    const after = await db.query.interviewStages.findFirst({
      where: and(eq(interviewStages.userId, u.id), eq(interviewStages.id, stage.id)),
    })
    expect(after?.googleEventId).toBeNull()
  })
})
