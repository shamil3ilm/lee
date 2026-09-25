import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { interviewStages } from '@/lib/db/schema'
import * as applicationsQ from '@/lib/db/queries/applications'
import * as documentsQ from '@/lib/db/queries/documents'
import * as stagesQ from '@/lib/db/queries/stages'
import { getMasterCV } from './master'
import { interviewDebriefSchema } from './types'
import { ApplicationNotFoundError, MasterCVNotFoundError } from './errors'
import { snapshotForDebrief } from '@/lib/staleness/snapshot'
import type { AIProvider } from '@/lib/ai/types'
import type { Document } from '@/lib/db/queries/documents'

// ---------------------------------------------------------------------------
// v4.3 — Interview debrief service. Two entry points:
//
//   1. saveQuickDebrief: persist the user's raw markdown notes on the
//      interview_stages row (the schema already has `debriefNotesMd`).
//   2. generateAIDebrief: call the AI provider to turn those notes into a
//      structured InterviewDebrief JSON, and persist as a versioned document
//      with kind='interview_debrief'.
//
// The AI generator refuses to run when quickNotes are empty — asking the AI
// to reflect on nothing yields hallucinated praise, which is the exact
// failure mode the honest-tone prompt is designed to prevent.
// ---------------------------------------------------------------------------

export class StageNotFoundError extends Error {
  constructor(id: string) {
    super(`Interview stage ${id} not found.`)
    this.name = 'StageNotFoundError'
  }
}

export class EmptyDebriefNotesError extends Error {
  constructor() {
    super('Add quick notes before generating an AI debrief.')
    this.name = 'EmptyDebriefNotesError'
  }
}

async function findStage(userId: string, stageId: string) {
  return db.query.interviewStages.findFirst({
    where: and(eq(interviewStages.userId, userId), eq(interviewStages.id, stageId)),
  })
}

export async function saveQuickDebrief(input: {
  userId: string
  stageId: string
  notesMd: string
}): Promise<void> {
  const { userId, stageId, notesMd } = input
  const stage = await findStage(userId, stageId)
  if (!stage) throw new StageNotFoundError(stageId)
  await stagesQ.update(userId, stageId, {
    debriefNotesMd: notesMd,
  })
}

export async function generateAIDebrief(input: {
  userId: string
  stageId: string
  ai: AIProvider
}): Promise<Document> {
  const { userId, stageId, ai } = input

  const stage = await findStage(userId, stageId)
  if (!stage) throw new StageNotFoundError(stageId)

  const quickNotes = (stage.debriefNotesMd ?? '').trim()
  if (!quickNotes) throw new EmptyDebriefNotesError()

  const application = await applicationsQ.getById(userId, stage.applicationId)
  if (!application) throw new ApplicationNotFoundError(stage.applicationId)

  const master = await getMasterCV(userId)
  if (!master) throw new MasterCVNotFoundError()

  const debrief = await ai.generateInterviewDebrief({
    master,
    application,
    stage: {
      id: stage.id,
      kind: stage.kind,
      title: stage.title,
      scheduledAt: stage.scheduledAt,
    },
    quickNotes,
  })

  // Force stageId / applicationId to the trusted server values — the AI is
  // free-form and could echo back stale ids from the prompt.
  const validated = interviewDebriefSchema.parse({
    ...debrief,
    stageId: stage.id,
    applicationId: application.id,
  })

  const company = application.job.company?.name ?? 'unknown'
  const title = `Debrief — ${stage.kind} — ${application.job.title} @ ${company}`.slice(0, 200)

  const version = await documentsQ.nextVersion(
    userId,
    application.id,
    'interview_debrief',
  )

  const stateSnapshot = snapshotForDebrief(
    stage,
    {
      id: application.id,
      status: application.status,
      appliedAt: application.appliedAt,
      jobId: application.jobId,
      updatedAt: application.updatedAt,
      companyId: application.job.companyId ?? null,
      companyName: application.job.company?.name ?? null,
      jobTitle: application.job.title,
    },
    {
      id: application.job.id,
      title: application.job.title,
      descriptionMd: application.job.descriptionMd,
      parsedMeta: application.job.parsedMeta,
      benefits: application.job.benefits,
      updatedAt: application.job.updatedAt,
    },
  )

  return documentsQ.create(userId, {
    applicationId: application.id,
    kind: 'interview_debrief',
    version,
    title,
    content: { ...validated, stateSnapshot },
  })
}
