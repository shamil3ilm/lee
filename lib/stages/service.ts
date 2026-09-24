import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { interviewStages } from '@/lib/db/schema'
import * as stagesQ from '@/lib/db/queries/stages'
import * as appsQ from '@/lib/db/queries/applications'
import * as actQ from '@/lib/db/queries/activities'
import type { InterviewStage, NewInterviewStage } from '@/lib/db/queries/stages'
import {
  deleteStageEvent,
  pushStageToCalendar,
  updateStageEvent,
} from '@/lib/calendar/service'
import { NoGoogleAccountError } from '@/lib/google/tokens'
import { logger } from '@/lib/logger'

export interface CreateStageArgs {
  userId: string
  applicationId: string
  kind: string
  title?: string
  scheduledAt?: Date
  durationMinutes?: number
  location?: string
  meetingUrl?: string
  prepNotesMd?: string
}

/**
 * Best-effort calendar op. NoGoogleAccountError is expected (user hasn't
 * connected Google) — skip silently. Any other error is logged but never
 * bubbles up: the local stage record is the source of truth, and we do not
 * want a Google 5xx to roll back a valid stage save.
 */
async function tryCalendarOp(
  op: 'push' | 'update' | 'delete',
  userId: string,
  stageId: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn()
  } catch (err) {
    if (err instanceof NoGoogleAccountError) {
      logger.debug('calendar_skipped_no_account', { op, userId, stageId })
      return
    }
    logger.warn('calendar_op_failed', {
      op,
      userId,
      stageId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function findStageById(userId: string, id: string): Promise<InterviewStage | undefined> {
  return db.query.interviewStages.findFirst({
    where: and(eq(interviewStages.userId, userId), eq(interviewStages.id, id)),
  })
}

export async function createStage(args: CreateStageArgs): Promise<InterviewStage> {
  const {
    userId,
    applicationId,
    kind,
    title,
    scheduledAt,
    durationMinutes,
    location,
    meetingUrl,
    prepNotesMd,
  } = args

  const stage = await db.transaction(async (tx) => {
    const created = await stagesQ.create(
      userId,
      applicationId,
      {
        kind,
        title: title ?? null,
        scheduledAt: scheduledAt ?? null,
        durationMinutes: durationMinutes ?? null,
        location: location ?? null,
        meetingUrl: meetingUrl ?? null,
        prepNotesMd: prepNotesMd ?? null,
      },
      tx,
    )

    // Bump next_action_at when the new stage is earlier than the current
    // value (or there is no current value). Later stages should not override
    // an existing sooner action.
    if (scheduledAt) {
      const app = await appsQ.getById(userId, applicationId, tx)
      if (app && (!app.nextActionAt || scheduledAt < app.nextActionAt)) {
        await appsQ.setNextAction(userId, applicationId, scheduledAt, tx)
      }
    }

    await actQ.log(
      userId,
      applicationId,
      'stage_added',
      {
        stageId: created.id,
        kind,
        scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
      },
      tx,
    )

    return created
  })

  // Auto-push to Google Calendar OUTSIDE the transaction so a Google 5xx
  // never rolls back the stage save.
  if (scheduledAt) {
    await tryCalendarOp('push', userId, stage.id, () =>
      pushStageToCalendar({ userId, stageId: stage.id }),
    )
  }

  return stage
}

export async function updateStage(args: {
  userId: string
  id: string
  patch: Partial<NewInterviewStage>
}): Promise<InterviewStage | null> {
  const { userId, id, patch } = args

  const before = await findStageById(userId, id)
  const row = await stagesQ.update(userId, id, patch)
  if (!row) return null

  // Push/patch/delete calendar events only when scheduledAt actually changed.
  // Comparing valueOf() handles nulls (undefined → NaN → not equal → false).
  const scheduledChanged =
    'scheduledAt' in patch &&
    (patch.scheduledAt ?? null)?.valueOf() !== (before?.scheduledAt ?? null)?.valueOf()

  if (scheduledChanged && row.scheduledAt) {
    if (row.googleEventId) {
      await tryCalendarOp('update', userId, id, () =>
        updateStageEvent({ userId, stageId: id }),
      )
    } else {
      await tryCalendarOp('push', userId, id, () =>
        pushStageToCalendar({ userId, stageId: id }),
      )
    }
  }

  return row
}

/**
 * Delete a stage. If it has a linked Google Calendar event, remove it too so
 * the calendar stays consistent with the tracker.
 */
export async function deleteStage(args: { userId: string; id: string }): Promise<boolean> {
  const { userId, id } = args
  await tryCalendarOp('delete', userId, id, () =>
    deleteStageEvent({ userId, stageId: id }),
  )
  return stagesQ.remove(userId, id)
}
