import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { interviewStages } from '@/lib/db/schema'
import { getGoogleTokens } from '@/lib/google/tokens'
import * as appsQ from '@/lib/db/queries/applications'
import * as stagesQ from '@/lib/db/queries/stages'
import * as profileQ from '@/lib/db/queries/profile'
import { DEFAULT_TIMEZONE } from '@/lib/ui/timezone'
import {
  createEvent,
  deleteEvent,
  updateEvent,
  type CalendarEventInput,
} from './adapter'

/** Fallback interview length in minutes when stage.durationMinutes is null. */
const DEFAULT_DURATION_MINUTES = 60

/**
 * DI seams for tests. Callers in production leave these unset — the real
 * adapters are used.
 */
export interface CalendarServiceAdapters {
  createEvent?: typeof createEvent
  updateEvent?: typeof updateEvent
  deleteEvent?: typeof deleteEvent
}

interface StageContext {
  stage: NonNullable<Awaited<ReturnType<typeof stagesQ.list>>>[number]
  application: NonNullable<Awaited<ReturnType<typeof appsQ.getById>>>
  timezone: string
}

async function loadStageContext(
  userId: string,
  stageId: string,
): Promise<StageContext | null> {
  const stage = await db.query.interviewStages.findFirst({
    where: and(eq(interviewStages.userId, userId), eq(interviewStages.id, stageId)),
  })
  if (!stage) return null
  const application = await appsQ.getById(userId, stage.applicationId)
  if (!application) return null
  const profile = await profileQ.get(userId)
  const timezone = profile?.timezone ?? DEFAULT_TIMEZONE
  return { stage, application, timezone }
}

function buildEvent(ctx: StageContext): CalendarEventInput {
  const { stage, application, timezone } = ctx
  const jobTitle = application.job?.title ?? 'Interview'
  const companyName = application.job?.company?.name ?? 'Company'

  if (!stage.scheduledAt) {
    throw new Error(`stage ${stage.id} has no scheduledAt — cannot build event`)
  }
  const start = stage.scheduledAt
  const end = new Date(
    start.getTime() + (stage.durationMinutes ?? DEFAULT_DURATION_MINUTES) * 60_000,
  )

  const descriptionLines: string[] = []
  if (stage.title) descriptionLines.push(stage.title)
  if (stage.prepNotesMd) {
    descriptionLines.push('')
    descriptionLines.push('Prep notes:')
    descriptionLines.push(stage.prepNotesMd)
  }
  descriptionLines.push('')
  descriptionLines.push(`Application: ${application.id}`)

  return {
    summary: `Interview: ${jobTitle} @ ${companyName}`,
    description: descriptionLines.join('\n'),
    location: stage.meetingUrl ?? stage.location ?? undefined,
    start: { dateTime: start.toISOString(), timeZone: timezone },
    end: { dateTime: end.toISOString(), timeZone: timezone },
  }
}

/**
 * Create a Google Calendar event for a stage and persist the returned event
 * id back onto the interview_stages row so we can later update/delete it.
 * Also bumps user_profile.syncedCalendarAt so the UI can surface "last
 * synced" timestamps consistently with Gmail sync.
 *
 * Idempotent-ish: if the stage already has a googleEventId, we NO-OP rather
 * than creating a duplicate — callers who want to force a fresh event should
 * clear the id first.
 */
export async function pushStageToCalendar(args: {
  userId: string
  stageId: string
  adapters?: CalendarServiceAdapters
}): Promise<{ eventId: string }> {
  const { userId, stageId } = args
  const createFn = args.adapters?.createEvent ?? createEvent

  const ctx = await loadStageContext(userId, stageId)
  if (!ctx) throw new Error(`stage ${stageId} not found`)
  if (ctx.stage.googleEventId) {
    return { eventId: ctx.stage.googleEventId }
  }

  const tokens = await getGoogleTokens(userId)
  const event = buildEvent(ctx)
  const { eventId } = await createFn({ tokens, event })

  await stagesQ.update(userId, stageId, { googleEventId: eventId })
  await profileQ.upsert(userId, { syncedCalendarAt: new Date() })
  return { eventId }
}

/**
 * PATCH the existing Google event so it stays in sync with the stage record.
 * No-op when the stage has never been pushed (no googleEventId).
 */
export async function updateStageEvent(args: {
  userId: string
  stageId: string
  adapters?: CalendarServiceAdapters
}): Promise<void> {
  const { userId, stageId } = args
  const updateFn = args.adapters?.updateEvent ?? updateEvent

  const ctx = await loadStageContext(userId, stageId)
  if (!ctx) return
  if (!ctx.stage.googleEventId) return
  if (!ctx.stage.scheduledAt) return

  const tokens = await getGoogleTokens(userId)
  const event = buildEvent(ctx)
  await updateFn({ tokens, eventId: ctx.stage.googleEventId, event })
  await profileQ.upsert(userId, { syncedCalendarAt: new Date() })
}

/**
 * DELETE the Google event and clear googleEventId on the stage row. No-op
 * when there's nothing to delete.
 */
export async function deleteStageEvent(args: {
  userId: string
  stageId: string
  adapters?: CalendarServiceAdapters
}): Promise<void> {
  const { userId, stageId } = args
  const deleteFn = args.adapters?.deleteEvent ?? deleteEvent

  const ctx = await loadStageContext(userId, stageId)
  if (!ctx) return
  if (!ctx.stage.googleEventId) return

  const tokens = await getGoogleTokens(userId)
  await deleteFn({ tokens, eventId: ctx.stage.googleEventId })
  await stagesQ.update(userId, stageId, { googleEventId: null })
}
