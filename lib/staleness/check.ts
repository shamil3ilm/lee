import { and, desc, eq, gt } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  activities,
  applications,
  companies,
  documents,
  interviewStages,
  jobs,
} from '@/lib/db/schema'
import * as documentsQ from '@/lib/db/queries/documents'
import { getMasterCV } from '@/lib/documents/master'
import {
  snapshotForCoverLetter,
  snapshotForDebrief,
  snapshotForFollowup,
  snapshotForMerged,
  snapshotForOutreach,
  snapshotForPrepPack,
  snapshotForTailoredCV,
} from './snapshot'
import type { Severity, StalenessResult, StateSnapshot } from './types'

// v9 — the check util. For each document kind we (1) load the current state,
// (2) rebuild the current-state snapshot, and (3) diff hashes + fields per
// spec §5 to produce a severity classification. Pre-v9 docs have no
// previous snapshot; those are treated as `fresh` with a placeholder summary
// so the UI can render nothing (no banner) — the spec is explicit that we
// do NOT warn retroactively.

function emptySnapshot(): StateSnapshot {
  return { capturedAt: new Date().toISOString(), hashes: {}, fields: {} }
}

function freshResult(current: StateSnapshot, summary: string): StalenessResult {
  return {
    severity: 'fresh',
    changedFields: [],
    summary,
    currentSnapshot: current,
    previousSnapshot: null,
  }
}

interface Diff {
  changedFields: string[]
  severity: Severity
  summary: string
}

/**
 * Diff two snapshots given a hash-severity table. `criticalHashes` and
 * `minorHashes` map hash-key → human-friendly label; if the hash under that
 * key differs between prev and current the label is added to `changedFields`
 * and the severity is escalated accordingly.
 */
function diffByHashes(
  prev: StateSnapshot,
  curr: StateSnapshot,
  criticalHashes: Record<string, string>,
  minorHashes: Record<string, string> = {},
): Diff {
  const changed: string[] = []
  let severity: Severity = 'fresh'
  for (const [key, label] of Object.entries(criticalHashes)) {
    if ((prev.hashes[key] ?? '') !== (curr.hashes[key] ?? '')) {
      changed.push(label)
      severity = 'critical'
    }
  }
  for (const [key, label] of Object.entries(minorHashes)) {
    if ((prev.hashes[key] ?? '') !== (curr.hashes[key] ?? '')) {
      changed.push(label)
      if (severity !== 'critical') severity = 'minor'
    }
  }
  return {
    severity,
    changedFields: changed,
    summary: changed.length === 0 ? 'No material change since generation.' : `Changed: ${changed.join(', ')}.`,
  }
}

/**
 * Check whether a document's state fingerprint still matches the live state.
 * Returns `severity: 'fresh'` for pre-v9 docs (missing snapshot) — the UI
 * treats that as "no banner." Throws when the document does not exist.
 */
export async function checkDocumentStaleness(
  userId: string,
  documentId: string,
): Promise<StalenessResult> {
  const doc = await documentsQ.getById(userId, documentId)
  if (!doc) throw new Error(`Document ${documentId} not found`)

  const previous = extractSnapshot(doc.content)

  switch (doc.kind) {
    case 'tailored_cv':
      return checkTailoredCV(userId, doc, previous)
    case 'cover_letter':
      return checkCoverLetter(userId, doc, previous)
    case 'outreach_linkedin_connection':
    case 'outreach_linkedin_message':
    case 'outreach_recruiter_reply':
      return checkOutreach(userId, doc, previous)
    case 'outreach_followup_email':
      return checkFollowup(userId, doc, previous)
    case 'interview_prep_pack':
      return checkPrepPack(userId, doc, previous)
    case 'interview_debrief':
      return checkDebrief(userId, doc, previous)
    case 'merged_pdf':
      return checkMerged(userId, doc, previous)
    default:
      // No per-kind check registered (e.g. master_cv, latex_*). Treat as
      // fresh but describe why so the UI copy is honest.
      if (!previous) {
        return freshResult(emptySnapshot(), 'No snapshot recorded; treated as fresh.')
      }
      return freshResult(previous, 'No staleness check registered for this kind.')
  }
}

function extractSnapshot(content: unknown): StateSnapshot | null {
  if (!content || typeof content !== 'object') return null
  const snap = (content as { stateSnapshot?: unknown }).stateSnapshot
  if (!snap || typeof snap !== 'object') return null
  const s = snap as Partial<StateSnapshot>
  if (typeof s.capturedAt !== 'string' || typeof s.hashes !== 'object') return null
  return {
    capturedAt: s.capturedAt,
    hashes: (s.hashes ?? {}) as Record<string, string>,
    fields: (s.fields ?? {}) as Record<string, unknown>,
  }
}

async function loadApplicationBundle(userId: string, applicationId: string) {
  return db
    .select({
      app: applications,
      job: jobs,
      company: companies,
    })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .leftJoin(companies, eq(jobs.companyId, companies.id))
    .where(and(eq(applications.userId, userId), eq(applications.id, applicationId)))
    .limit(1)
    .then((rows) => rows[0] ?? null)
}

function makeAppRecord(bundle: {
  app: typeof applications.$inferSelect
  job: typeof jobs.$inferSelect
  company: typeof companies.$inferSelect | null
}) {
  return {
    id: bundle.app.id,
    status: bundle.app.status,
    appliedAt: bundle.app.appliedAt,
    jobId: bundle.app.jobId,
    updatedAt: bundle.app.updatedAt,
    companyId: bundle.job.companyId ?? null,
    companyName: bundle.company?.name ?? null,
    jobTitle: bundle.job.title,
  }
}

function makeJobRecord(job: typeof jobs.$inferSelect) {
  return {
    id: job.id,
    title: job.title,
    descriptionMd: job.descriptionMd,
    parsedMeta: job.parsedMeta,
    benefits: job.benefits,
    updatedAt: job.updatedAt,
  }
}

async function checkTailoredCV(
  userId: string,
  doc: typeof documents.$inferSelect,
  previous: StateSnapshot | null,
): Promise<StalenessResult> {
  const bundle = doc.applicationId
    ? await loadApplicationBundle(userId, doc.applicationId)
    : null
  const master = await getMasterCV(userId)
  const current =
    bundle && master
      ? snapshotForTailoredCV(makeAppRecord(bundle), makeJobRecord(bundle.job), master)
      : emptySnapshot()
  if (!previous) return freshResult(current, 'No snapshot recorded; treated as fresh.')

  const diff = diffByHashes(
    previous,
    current,
    { job_parsed_meta: 'job.parsedMeta', master_cv: 'master CV' },
    { job_benefits: 'job.benefits', job: 'job details' },
  )
  return {
    severity: diff.severity,
    changedFields: diff.changedFields,
    summary: diff.summary,
    currentSnapshot: current,
    previousSnapshot: previous,
  }
}

async function checkCoverLetter(
  userId: string,
  doc: typeof documents.$inferSelect,
  previous: StateSnapshot | null,
): Promise<StalenessResult> {
  const bundle = doc.applicationId
    ? await loadApplicationBundle(userId, doc.applicationId)
    : null
  const master = await getMasterCV(userId)
  const current =
    bundle && master
      ? snapshotForCoverLetter(makeAppRecord(bundle), makeJobRecord(bundle.job), master)
      : emptySnapshot()
  if (!previous) return freshResult(current, 'No snapshot recorded; treated as fresh.')

  const diff = diffByHashes(
    previous,
    current,
    { job_parsed_meta: 'job.parsedMeta', master_cv: 'master CV' },
    { job_benefits: 'job.benefits', job: 'job details' },
  )
  return {
    severity: diff.severity,
    changedFields: diff.changedFields,
    summary: diff.summary,
    currentSnapshot: current,
    previousSnapshot: previous,
  }
}

async function checkOutreach(
  userId: string,
  doc: typeof documents.$inferSelect,
  previous: StateSnapshot | null,
): Promise<StalenessResult> {
  const bundle = doc.applicationId
    ? await loadApplicationBundle(userId, doc.applicationId)
    : null
  const master = await getMasterCV(userId)
  const current =
    bundle && master
      ? snapshotForOutreach(makeAppRecord(bundle), makeJobRecord(bundle.job), master)
      : emptySnapshot()
  if (!previous) return freshResult(current, 'No snapshot recorded; treated as fresh.')

  // Non-follow-up outreach: critical when application state moves; minor when
  // only the JD text changes.
  const diff = diffByHashes(
    previous,
    current,
    { application: 'application.status/appliedAt' },
    { job: 'job description', master_cv: 'master CV' },
  )
  return {
    severity: diff.severity,
    changedFields: diff.changedFields,
    summary: diff.summary || 'No material change since generation.',
    currentSnapshot: current,
    previousSnapshot: previous,
  }
}

async function checkFollowup(
  userId: string,
  doc: typeof documents.$inferSelect,
  previous: StateSnapshot | null,
): Promise<StalenessResult> {
  const bundle = doc.applicationId
    ? await loadApplicationBundle(userId, doc.applicationId)
    : null
  const previousDays =
    previous && typeof previous.fields.daysSince === 'number' ? previous.fields.daysSince : 0

  let latestActivity = null as null | typeof activities.$inferSelect
  if (bundle) {
    const rows = await db
      .select()
      .from(activities)
      .where(
        and(
          eq(activities.userId, userId),
          eq(activities.applicationId, bundle.app.id),
        ),
      )
      .orderBy(desc(activities.createdAt))
      .limit(1)
    latestActivity = rows[0] ?? null
  }
  const current = bundle
    ? snapshotForFollowup(makeAppRecord(bundle), latestActivity, previousDays)
    : emptySnapshot()
  if (!previous) return freshResult(current, 'No snapshot recorded; treated as fresh.')

  // Follow-up staleness rule (spec §5): any newer email or status_change
  // activity since capturedAt = critical; any application.status delta = critical.
  const changedFields: string[] = []
  let severity: Severity = 'fresh'
  if (previous.hashes.application !== current.hashes.application) {
    changedFields.push('application.status/appliedAt')
    severity = 'critical'
  }

  if (bundle) {
    const capturedAt = new Date(previous.capturedAt)
    const newerActivity = await db
      .select({ id: activities.id, kind: activities.kind, createdAt: activities.createdAt })
      .from(activities)
      .where(
        and(
          eq(activities.userId, userId),
          eq(activities.applicationId, bundle.app.id),
          gt(activities.createdAt, capturedAt),
        ),
      )
      .limit(5)
    const relevant = newerActivity.filter(
      (a) => a.kind === 'email' || a.kind === 'status_change',
    )
    if (relevant.length > 0) {
      changedFields.push(`${relevant.length} new ${relevant.length === 1 ? 'activity' : 'activities'}`)
      severity = 'critical'
    }
  }

  const summary =
    severity === 'critical'
      ? `Since generated: ${changedFields.join(', ')}.`
      : 'No material change since generation.'

  return {
    severity,
    changedFields,
    summary,
    currentSnapshot: current,
    previousSnapshot: previous,
  }
}

async function checkPrepPack(
  userId: string,
  doc: typeof documents.$inferSelect,
  previous: StateSnapshot | null,
): Promise<StalenessResult> {
  const bundle = doc.applicationId
    ? await loadApplicationBundle(userId, doc.applicationId)
    : null

  // We need to find the stage tied to this doc. The prep-pack content
  // includes stageId (see interviewPrepPackSchema) when the caller supplied
  // one — fall back to the earliest scheduled stage of the same kind if not.
  const content = doc.content as {
    stageId?: string | null
    stageKind?: string | null
  } | null
  let stage: typeof interviewStages.$inferSelect | null = null
  if (bundle && content?.stageId) {
    const rows = await db
      .select()
      .from(interviewStages)
      .where(
        and(
          eq(interviewStages.userId, userId),
          eq(interviewStages.id, content.stageId),
        ),
      )
      .limit(1)
    stage = rows[0] ?? null
  }

  const stageRecord =
    stage ??
    ({
      id: content?.stageId ?? `synthetic:${content?.stageKind ?? 'unknown'}`,
      kind: content?.stageKind ?? 'unknown',
      title: null,
      scheduledAt: null,
      status: 'scheduled',
      prepNotesMd: null,
      googleEventId: null,
      updatedAt: null,
    } as const)

  const current = bundle
    ? snapshotForPrepPack(makeAppRecord(bundle), stageRecord, makeJobRecord(bundle.job))
    : emptySnapshot()
  if (!previous) return freshResult(current, 'No snapshot recorded; treated as fresh.')

  // Prep-pack severity rules (spec §5): critical if kind changed or
  // scheduledAt moved > 6h; minor if prep_notes_md changed.
  const changedFields: string[] = []
  let severity: Severity = 'fresh'

  const prevKind = previous.fields.stageKind
  const currKind = current.fields.stageKind
  if (prevKind !== currKind) {
    changedFields.push('stage.kind')
    severity = 'critical'
  }
  const prevStatus = previous.fields.stageStatus
  const currStatus = current.fields.stageStatus
  if (prevStatus !== currStatus && currStatus === 'cancelled') {
    changedFields.push('stage cancelled')
    severity = 'critical'
  }
  const prevWhen =
    typeof previous.fields.stageScheduledAt === 'string'
      ? new Date(previous.fields.stageScheduledAt).getTime()
      : null
  const currWhen =
    typeof current.fields.stageScheduledAt === 'string'
      ? new Date(current.fields.stageScheduledAt).getTime()
      : null
  if (prevWhen !== null && currWhen !== null && Math.abs(currWhen - prevWhen) > 6 * 3600 * 1000) {
    changedFields.push('stage.scheduledAt moved > 6h')
    severity = 'critical'
  }

  if (previous.hashes.stage !== current.hashes.stage && severity !== 'critical') {
    changedFields.push('stage details')
    severity = 'minor'
  }

  const summary =
    changedFields.length === 0
      ? 'No material change since generation.'
      : `Changed: ${changedFields.join(', ')}.`

  return {
    severity,
    changedFields,
    summary,
    currentSnapshot: current,
    previousSnapshot: previous,
  }
}

async function checkDebrief(
  userId: string,
  doc: typeof documents.$inferSelect,
  previous: StateSnapshot | null,
): Promise<StalenessResult> {
  const bundle = doc.applicationId
    ? await loadApplicationBundle(userId, doc.applicationId)
    : null
  const content = doc.content as { stageId?: string } | null
  let stage: typeof interviewStages.$inferSelect | null = null
  if (bundle && content?.stageId) {
    const rows = await db
      .select()
      .from(interviewStages)
      .where(
        and(
          eq(interviewStages.userId, userId),
          eq(interviewStages.id, content.stageId),
        ),
      )
      .limit(1)
    stage = rows[0] ?? null
  }
  const stageRecord = stage
    ? stage
    : ({
        id: content?.stageId ?? 'missing',
        kind: 'unknown',
        title: null,
        scheduledAt: null,
        status: 'deleted',
        prepNotesMd: null,
        googleEventId: null,
        updatedAt: null,
      } as const)

  const current =
    bundle && stage
      ? snapshotForDebrief(stage, makeAppRecord(bundle), makeJobRecord(bundle.job))
      : emptySnapshot()

  if (!previous) return freshResult(current, 'No snapshot recorded; treated as fresh.')

  // Debrief only escalates when the stage itself is gone (spec §5).
  if (!stage) {
    return {
      severity: 'critical',
      changedFields: ['stage deleted'],
      summary: 'The underlying interview stage was deleted since this debrief was generated.',
      currentSnapshot: current,
      previousSnapshot: previous,
    }
  }
  void stageRecord // stage record is only used to keep types honest when live
  return {
    severity: 'fresh',
    changedFields: [],
    summary: 'No material change since generation.',
    currentSnapshot: current,
    previousSnapshot: previous,
  }
}

async function checkMerged(
  userId: string,
  doc: typeof documents.$inferSelect,
  previous: StateSnapshot | null,
): Promise<StalenessResult> {
  const content = doc.content as {
    sourceRefs?: Array<{ kind: 'document' | 'asset'; id: string }>
  } | null
  const refs = Array.isArray(content?.sourceRefs) ? content!.sourceRefs : []
  const docIds = refs.filter((r) => r.kind === 'document').map((r) => r.id)
  const sourceDocs = (
    await Promise.all(docIds.map((id) => documentsQ.getById(userId, id)))
  ).filter((d): d is NonNullable<typeof d> => d !== null)
  const current = snapshotForMerged(sourceDocs)

  if (!previous) return freshResult(current, 'No snapshot recorded; treated as fresh.')

  if (previous.hashes.sources !== current.hashes.sources) {
    // Identify which document(s) drifted for a nicer summary.
    const changed = sourceDocs
      .filter((d) => previous.hashes[d.id] !== current.hashes[d.id])
      .map((d) => d.title)
    return {
      severity: 'critical',
      changedFields: changed.length > 0 ? changed : ['merged sources'],
      summary:
        changed.length > 0
          ? `Source document(s) changed since merge: ${changed.join(', ')}.`
          : 'A source document version has changed since merge.',
      currentSnapshot: current,
      previousSnapshot: previous,
    }
  }

  return {
    severity: 'fresh',
    changedFields: [],
    summary: 'No material change since generation.',
    currentSnapshot: current,
    previousSnapshot: previous,
  }
}
