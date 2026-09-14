import { db } from '@/lib/db/client'
import * as stagesQ from '@/lib/db/queries/stages'
import * as appsQ from '@/lib/db/queries/applications'
import * as actQ from '@/lib/db/queries/activities'
import type { InterviewStage, NewInterviewStage } from '@/lib/db/queries/stages'

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

  return db.transaction(async (tx) => {
    const stage = await stagesQ.create(
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
        stageId: stage.id,
        kind,
        scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
      },
      tx,
    )

    return stage
  })
}

export async function updateStage(args: {
  userId: string
  id: string
  patch: Partial<NewInterviewStage>
}): Promise<InterviewStage | null> {
  const row = await stagesQ.update(args.userId, args.id, args.patch)
  return row ?? null
}
