import type { Application } from '@/lib/db/queries/applications'
import type { InterviewStage } from '@/lib/db/queries/stages'
import type { Activity } from '@/lib/db/queries/activities'
import type { Document } from '@/lib/db/queries/documents'
import type { MasterCV } from '@/lib/documents/types'
import { sha256Fields } from './hash'
import type { StateSnapshot } from './types'

// v9 — snapshot builders per spec §3. Each function returns the subset of
// source-state fields that determine correctness for the corresponding
// document kind, plus a `hashes` map so cheap diffs are possible without
// diffing the whole content payload.
//
// A note on the two layers: `hashes` gives a bit-exact "did anything change"
// signal and drives severity classification; `fields` carries the small,
// stable values the UI needs to render a diff (e.g. old vs new status).
// Large payloads (`descriptionMd`, `parsedMeta`) are hashed but not stored
// in `fields` — the diff summary refers to them by name instead.

// The three source-record types generators need. Kept structural so
// factories in tests can pass plain literals without importing the whole
// Drizzle types.
export type JobRecord = {
  id: string
  title: string
  descriptionMd: string | null
  parsedMeta: unknown
  benefits: unknown
  updatedAt: Date | null
}

export type ApplicationRecord = Pick<
  Application,
  'id' | 'status' | 'appliedAt' | 'jobId' | 'updatedAt'
> & {
  companyId?: string | null
  companyName?: string | null
  jobTitle?: string | null
}

export type StageRecord = Pick<
  InterviewStage,
  'id' | 'kind' | 'title' | 'scheduledAt' | 'status' | 'prepNotesMd' | 'googleEventId'
> & { updatedAt?: Date | null }

function nowIso(): string {
  return new Date().toISOString()
}

function toIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null
}

function summarizeMasterCv(master: MasterCV): Record<string, unknown> {
  return {
    name: master.basics.name,
    headline: master.basics.headline,
    summary: master.summary,
    experienceCount: master.experience?.length ?? 0,
    projectsCount: master.projects?.length ?? 0,
    skillsPrimary: master.skills.primary,
    skillsSecondary: master.skills.secondary ?? [],
  }
}

function hashJobFingerprint(job: JobRecord): string {
  return sha256Fields({
    id: job.id,
    title: job.title,
    descriptionMd: job.descriptionMd ?? null,
    parsedMeta: job.parsedMeta ?? {},
    benefits: job.benefits ?? {},
  })
}

function hashApplicationFingerprint(app: ApplicationRecord): string {
  return sha256Fields({
    id: app.id,
    status: app.status,
    appliedAt: toIso(app.appliedAt ?? null),
    jobId: app.jobId,
    companyId: app.companyId ?? null,
  })
}

function hashMasterFingerprint(master: MasterCV): string {
  return sha256Fields(summarizeMasterCv(master))
}

/**
 * Outreach (LinkedIn connection/message, recruiter reply). The generator
 * conditions on the application context + job + master CV, so a change to
 * any of those means the draft may need regeneration.
 */
export function snapshotForOutreach(
  app: ApplicationRecord,
  job: JobRecord,
  master: MasterCV,
): StateSnapshot {
  return {
    capturedAt: nowIso(),
    hashes: {
      application: hashApplicationFingerprint(app),
      job: hashJobFingerprint(job),
      master_cv: hashMasterFingerprint(master),
    },
    fields: {
      applicationStatus: app.status,
      applicationAppliedAt: toIso(app.appliedAt ?? null),
      jobTitle: job.title,
      companyName: app.companyName ?? null,
    },
  }
}

/**
 * Follow-up email. Sensitive to inbound activity that would make the "haven't
 * heard back" framing wrong — the check util diffs activity counts + newest
 * activity timestamp, so we snapshot both here.
 */
export function snapshotForFollowup(
  app: ApplicationRecord,
  latestActivity: Activity | null,
  daysSince: number,
): StateSnapshot {
  return {
    capturedAt: nowIso(),
    hashes: {
      application: hashApplicationFingerprint(app),
      latest_activity: sha256Fields({
        id: latestActivity?.id ?? null,
        kind: latestActivity?.kind ?? null,
        createdAt: toIso(latestActivity?.createdAt ?? null),
      }),
    },
    fields: {
      applicationStatus: app.status,
      daysSince,
      latestActivityKind: latestActivity?.kind ?? null,
      latestActivityAt: toIso(latestActivity?.createdAt ?? null),
    },
  }
}

/**
 * Tailored CV. The AI conditions on `job.parsedMeta` (skills, seniority) plus
 * the master CV; a change to either invalidates the tailoring.
 */
export function snapshotForTailoredCV(
  app: ApplicationRecord,
  job: JobRecord,
  master: MasterCV,
): StateSnapshot {
  return {
    capturedAt: nowIso(),
    hashes: {
      application: hashApplicationFingerprint(app),
      job: hashJobFingerprint(job),
      job_parsed_meta: sha256Fields(job.parsedMeta ?? {}),
      job_benefits: sha256Fields(job.benefits ?? {}),
      master_cv: hashMasterFingerprint(master),
    },
    fields: {
      jobTitle: job.title,
      companyName: app.companyName ?? null,
    },
  }
}

/**
 * Cover letter. Same shape as tailored CV today. Kept as a separate function
 * so future divergence (e.g. adding company research to the letter but not
 * the CV) doesn't require dual-purpose edits.
 */
export function snapshotForCoverLetter(
  app: ApplicationRecord,
  job: JobRecord,
  master: MasterCV,
): StateSnapshot {
  return snapshotForTailoredCV(app, job, master)
}

/**
 * Interview prep pack. Sensitive to changes in the stage kind (a recruiter
 * screen becomes a system design; the whole pack is wrong) or a reschedule of
 * more than a few hours.
 */
export function snapshotForPrepPack(
  app: ApplicationRecord,
  stage: StageRecord,
  job: JobRecord,
): StateSnapshot {
  return {
    capturedAt: nowIso(),
    hashes: {
      application: hashApplicationFingerprint(app),
      job: hashJobFingerprint(job),
      stage: sha256Fields({
        id: stage.id,
        kind: stage.kind,
        status: stage.status,
        scheduledAt: toIso(stage.scheduledAt ?? null),
        prepNotesMd: stage.prepNotesMd ?? null,
      }),
    },
    fields: {
      stageKind: stage.kind,
      stageStatus: stage.status,
      stageScheduledAt: toIso(stage.scheduledAt ?? null),
      jobTitle: job.title,
    },
  }
}

/**
 * Interview debrief. Rarely stale (post-hoc doc). Only really invalidated
 * when the underlying stage is deleted.
 */
export function snapshotForDebrief(
  stage: StageRecord,
  app: ApplicationRecord,
  job: JobRecord,
): StateSnapshot {
  return {
    capturedAt: nowIso(),
    hashes: {
      stage: sha256Fields({
        id: stage.id,
        kind: stage.kind,
        status: stage.status,
      }),
      application: hashApplicationFingerprint(app),
      job: sha256Fields({ id: job.id, title: job.title }),
    },
    fields: {
      stageId: stage.id,
      stageKind: stage.kind,
    },
  }
}

/**
 * Merged PDF. The merged bytes are re-assembled on every download from the
 * source documents; the snapshot only needs to record which versions were
 * live at merge time so we can detect that one has been re-generated since.
 */
export function snapshotForMerged(sourceDocs: readonly Document[]): StateSnapshot {
  const perSource: Record<string, string> = {}
  for (const doc of sourceDocs) {
    perSource[doc.id] = sha256Fields({
      id: doc.id,
      version: doc.version,
      updatedAt: toIso(doc.updatedAt),
    })
  }
  return {
    capturedAt: nowIso(),
    hashes: {
      sources: sha256Fields(perSource),
      ...perSource,
    },
    fields: {
      sourceIds: sourceDocs.map((d) => d.id),
      sourceVersions: Object.fromEntries(sourceDocs.map((d) => [d.id, d.version])),
    },
  }
}
