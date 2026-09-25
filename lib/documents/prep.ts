import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { interviewStages } from '@/lib/db/schema'
import * as applicationsQ from '@/lib/db/queries/applications'
import * as documentsQ from '@/lib/db/queries/documents'
import { getMasterCV } from './master'
import { interviewPrepPackSchema } from './types'
import { ApplicationNotFoundError, MasterCVNotFoundError } from './errors'
import { snapshotForPrepPack, type StageRecord } from '@/lib/staleness/snapshot'
import { AISkippedError, checkPrepPackSignal } from '@/lib/ai/signal'
import { linkLatestCallToDocument, writeSkipLog } from '@/lib/ai/log'
import type { AIProvider } from '@/lib/ai/types'
import type { Document } from '@/lib/db/queries/documents'

/**
 * Generates an interview prep pack for a specific application + stage kind
 * (recruiter_screen | tech_screen | system_design | behavioral | take_home).
 * Persists as a versioned `documents` row so a candidate can iterate as the
 * loop progresses.
 */
export async function generateInterviewPrepPack(input: {
  userId: string
  applicationId: string
  stageKind: string
  stageId?: string
  ai: AIProvider
}): Promise<Document> {
  const master = await getMasterCV(input.userId)
  if (!master) throw new MasterCVNotFoundError()

  const application = await applicationsQ.getById(input.userId, input.applicationId)
  if (!application) throw new ApplicationNotFoundError(input.applicationId)

  const signal = checkPrepPackSignal(application, master)
  if (!signal.ok) {
    await writeSkipLog(
      { userId: input.userId, provider: 'unknown', kind: 'interview_prep_pack' },
      signal.code,
    )
    throw new AISkippedError(signal.code, signal.message, signal.fixHint)
  }

  const pack = await input.ai.generateInterviewPrepPack({
    master,
    application,
    stageKind: input.stageKind,
    stageId: input.stageId,
  })
  const validated = interviewPrepPackSchema.parse(pack)

  const version = await documentsQ.nextVersion(
    input.userId,
    input.applicationId,
    'interview_prep_pack',
  )
  const company = application.job.company?.name ?? 'unknown'
  const title = `Interview Prep - ${input.stageKind} for ${application.job.title} @ ${company}`.slice(
    0,
    200,
  )

  // v9 — snapshot the stage state. When the caller didn't provide a stageId
  // (e.g. prep-by-kind before scheduling), synthesize a minimal stage record
  // so the check util still has something to compare against.
  const stageRecord = await loadStageRecord(input.userId, input.stageId, input.stageKind)
  const stateSnapshot = snapshotForPrepPack(
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
    stageRecord,
    {
      id: application.job.id,
      title: application.job.title,
      descriptionMd: application.job.descriptionMd,
      parsedMeta: application.job.parsedMeta,
      benefits: application.job.benefits,
      updatedAt: application.job.updatedAt,
    },
  )

  const doc = await documentsQ.create(input.userId, {
    applicationId: input.applicationId,
    kind: 'interview_prep_pack',
    version,
    title,
    content: { ...validated, stateSnapshot },
  })
  await linkLatestCallToDocument(input.userId, doc.id, 'interview_prep_pack')
  return doc
}

/**
 * Best-effort stage lookup for the snapshot. When the caller passes a
 * stageId that resolves, we snapshot the real record; otherwise we build a
 * synthetic one with just the kind so `snapshotForPrepPack` still returns
 * a comparable hash.
 */
// Guard the DB lookup with a shallow UUID sanity check so callers passing
// synthetic stage ids (older tests, ad-hoc prep-by-kind) don't blow up the
// snapshot with a Postgres 22P02.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function loadStageRecord(
  userId: string,
  stageId: string | undefined,
  stageKind: string,
): Promise<StageRecord> {
  if (stageId && UUID_RE.test(stageId)) {
    const stage = await db.query.interviewStages.findFirst({
      where: and(eq(interviewStages.userId, userId), eq(interviewStages.id, stageId)),
    })
    if (stage) return stage
  }
  return {
    id: stageId ?? `synthetic:${stageKind}`,
    kind: stageKind,
    title: null,
    scheduledAt: null,
    status: 'scheduled',
    prepNotesMd: null,
    googleEventId: null,
    updatedAt: null,
  }
}
