import * as applicationsQ from '@/lib/db/queries/applications'
import * as activitiesQ from '@/lib/db/queries/activities'
import * as documentsQ from '@/lib/db/queries/documents'
import * as appContactsQ from '@/lib/db/queries/applicationContacts'
import { getMasterCV } from './master'
import { outreachDraftSchema, type OutreachKind, type OutreachTone } from './types'
import { ApplicationNotFoundError, MasterCVNotFoundError } from './errors'
import { AISkippedError, checkFollowupSignal, checkOutreachSignal } from '@/lib/ai/signal'
import {
  snapshotForFollowup,
  snapshotForOutreach,
  type ApplicationRecord,
  type JobRecord,
} from '@/lib/staleness/snapshot'
import type { StateSnapshot } from '@/lib/staleness/types'
import type { AIProvider } from '@/lib/ai/types'
import type { Document, DocumentKind } from '@/lib/db/queries/documents'

const KIND_LABELS: Record<OutreachKind, string> = {
  linkedin_connection: 'LinkedIn Connection',
  linkedin_message: 'LinkedIn Message',
  recruiter_reply: 'Recruiter Reply',
  followup_email: 'Follow-up Email',
}

function toDocumentKind(kind: OutreachKind): DocumentKind {
  switch (kind) {
    case 'linkedin_connection':
      return 'outreach_linkedin_connection'
    case 'linkedin_message':
      return 'outreach_linkedin_message'
    case 'recruiter_reply':
      return 'outreach_recruiter_reply'
    case 'followup_email':
      return 'outreach_followup_email'
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function daysBetween(from: Date, to: Date): number {
  const diff = to.getTime() - from.getTime()
  // Floor so a not-quite-7-days-ago application reports 6 (matching human
  // intuition — "one week later" means ~168 hours have passed).
  return Math.max(0, Math.floor(diff / MS_PER_DAY))
}

/**
 * Generates an outreach draft (LinkedIn connection / message / recruiter reply
 * / follow-up email) grounded in the master CV + application context. Persists
 * as a new `documents` row with a kind-specific `outreach_*` value so the
 * library filter chips can group them.
 *
 * For kind='followup_email', `daysSince` is required for the prompt. When
 * omitted, it is computed from application.appliedAt → now; if the application
 * has never been marked applied, this throws so callers can surface a hint
 * rather than persist a nonsensical "day 0" draft.
 */
export async function generateOutreachDraft(input: {
  userId: string
  applicationId: string
  kind: OutreachKind
  tone: OutreachTone
  ai: AIProvider
  daysSince?: number
}): Promise<Document> {
  const master = await getMasterCV(input.userId)
  if (!master) throw new MasterCVNotFoundError()

  const application = await applicationsQ.getById(input.userId, input.applicationId)
  if (!application) throw new ApplicationNotFoundError(input.applicationId)

  let daysSince: number | undefined = input.daysSince
  if (input.kind === 'followup_email' && daysSince === undefined) {
    if (application.appliedAt) {
      daysSince = daysBetween(application.appliedAt, new Date())
    }
    // If appliedAt is missing we leave daysSince undefined and let the
    // signal check below produce a proper AISkippedError with a fixHint.
  }

  // Signal-check gate: outreach requires sender name, job title, company name,
  // and — for linkedin_message — at least one linked contact.
  const linkedContactCount =
    input.kind === 'linkedin_message'
      ? (await appContactsQ.listForApplication(input.userId, input.applicationId)).length
      : undefined
  const outreachSignal = checkOutreachSignal(application, master, input.kind, {
    linkedContactCount,
  })
  if (!outreachSignal.ok) {
    throw new AISkippedError(
      outreachSignal.code,
      outreachSignal.message,
      outreachSignal.fixHint,
    )
  }
  if (input.kind === 'followup_email') {
    const followupSignal = checkFollowupSignal(application, daysSince)
    if (!followupSignal.ok) {
      throw new AISkippedError(
        followupSignal.code,
        followupSignal.message,
        followupSignal.fixHint,
      )
    }
  }

  const draft = await input.ai.draftOutreach({
    master,
    application,
    kind: input.kind,
    tone: input.tone,
    daysSince,
  })
  // The prompt asks the model to echo daysSince back on the draft; some models
  // will drop it. Server-side truth wins so the UI can group by day reliably.
  const draftWithMeta =
    input.kind === 'followup_email' && daysSince !== undefined
      ? { ...draft, daysSince }
      : draft
  const validated = outreachDraftSchema.parse(draftWithMeta)

  const documentKind = toDocumentKind(input.kind)
  const version = await documentsQ.nextVersion(input.userId, input.applicationId, documentKind)
  const company = application.job.company?.name ?? 'unknown'
  const daySuffix =
    input.kind === 'followup_email' && daysSince !== undefined ? ` (day ${daysSince})` : ''
  const title =
    `${KIND_LABELS[input.kind]}${daySuffix} - ${application.job.title} @ ${company}`.slice(0, 200)

  // v9 — snapshot the state used to generate this draft. Follow-ups get a
  // richer snapshot (activity fingerprint) so the check util can detect an
  // inbound email that arrived after the draft was rendered; the other
  // outreach kinds use the generic app + job + master snapshot.
  const appRecord: ApplicationRecord = {
    id: application.id,
    status: application.status,
    appliedAt: application.appliedAt,
    jobId: application.jobId,
    updatedAt: application.updatedAt,
    companyId: application.job.companyId ?? null,
    companyName: application.job.company?.name ?? null,
    jobTitle: application.job.title,
  }
  const jobRecord: JobRecord = {
    id: application.job.id,
    title: application.job.title,
    descriptionMd: application.job.descriptionMd,
    parsedMeta: application.job.parsedMeta,
    benefits: application.job.benefits,
    updatedAt: application.job.updatedAt,
  }
  let stateSnapshot: StateSnapshot
  if (input.kind === 'followup_email') {
    const recent = await activitiesQ.list(input.userId, input.applicationId, { limit: 1 })
    stateSnapshot = snapshotForFollowup(appRecord, recent[0] ?? null, daysSince ?? 0)
  } else {
    stateSnapshot = snapshotForOutreach(appRecord, jobRecord, master)
  }

  return documentsQ.create(input.userId, {
    applicationId: input.applicationId,
    kind: documentKind,
    version,
    title,
    content: { ...validated, stateSnapshot },
  })
}
