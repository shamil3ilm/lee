import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { activities, applications, documents } from '@/lib/db/schema'
import * as appsQ from '@/lib/db/queries/applications'
import * as prepsQ from '@/lib/db/queries/applicationPreps'
import * as profileQ from '@/lib/db/queries/profile'
import { getUserTimeZone } from '@/lib/settings/timezone'
import { logger } from '@/lib/logger'
import { appliedInstant, followupDue, isDayString, localDay } from './dates'
import { PrepareError, saveProgress } from './prepare'
import type { PrepProgress } from './progress'
import { applySettingsFrom } from './settings'

/**
 * "Mark applied" — records what the user did themselves (lee never submits
 * or sends anything): moves the application from Saved to Applied with the
 * date they picked, records the résumé variant/version and the document
 * versions used, and schedules the follow-up nudge `followupDays` later.
 * Idempotent: marking again keeps one status change and reschedules a
 * still-pending nudge to the new date.
 */

export interface MarkAppliedResult {
  appliedAt: Date
  followupDueAt: Date | null
  progress: PrepProgress
}

type DocRef = { id: string; kind: string; version: number }

/** The tailored CV and cover letter used: the ones the flow made, else the latest. */
async function documentsUsed(userId: string, applicationId: string, progress: PrepProgress): Promise<DocRef[]> {
  const fromFlow: DocRef[] = [
    progress.tailor?.documentId && progress.tailor.version
      ? { id: progress.tailor.documentId, kind: 'tailored_cv', version: progress.tailor.version }
      : null,
    progress.cover?.documentId && progress.cover.version
      ? { id: progress.cover.documentId, kind: 'cover_letter', version: progress.cover.version }
      : null,
  ].filter((d): d is DocRef => d !== null)
  const have = new Set(fromFlow.map((d) => d.kind))
  const missing = ['tailored_cv', 'cover_letter'].filter((k) => !have.has(k))
  if (missing.length === 0) return fromFlow
  const latest = await db
    .select({ id: documents.id, kind: documents.kind, version: documents.version })
    .from(documents)
    .where(and(eq(documents.userId, userId), eq(documents.applicationId, applicationId), inArray(documents.kind, missing)))
    .orderBy(desc(documents.createdAt))
  const picked = missing.flatMap((k) => latest.filter((d) => d.kind === k).slice(0, 1))
  return [...fromFlow, ...picked]
}

export async function markApplied(
  userId: string,
  applicationId: string,
  day: string,
  now: Date = new Date(),
): Promise<MarkAppliedResult> {
  if (!isDayString(day)) throw new PrepareError('Pick a valid date.')
  const [app, tz, profile] = await Promise.all([
    appsQ.getById(userId, applicationId),
    getUserTimeZone(userId),
    profileQ.get(userId),
  ])
  if (!app) throw new PrepareError('Application not found.', 'not_found')
  if (day > localDay(now, tz)) throw new PrepareError('The applied date can’t be in the future.')
  const prep = await prepsQ.ensure(userId, applicationId)
  const appliedAt = appliedInstant(day, tz, now)
  const settings = applySettingsFrom(profile)

  await db.transaction(async (tx) => {
    const moves = app.status === 'saved'
    await tx
      .update(applications)
      .set({ ...(moves ? { status: 'applied' } : {}), appliedAt, updatedAt: now })
      .where(and(eq(applications.userId, userId), eq(applications.id, applicationId)))
    if (moves) {
      await tx.insert(activities).values({ userId, applicationId, kind: 'status_change', payload: { from: 'saved', to: 'applied' } })
    }
  })

  const used = await documentsUsed(userId, applicationId, prep.progress)
  const progress: PrepProgress = {
    ...prep.progress,
    applied: {
      at: appliedAt.toISOString(),
      variantId: app.resumeVariantId,
      variantVersion: app.resumeVariantVersion,
      documents: used,
    },
  }
  const reschedule = prep.followupStatus === null || prep.followupStatus === 'pending'
  const followupDueAt = reschedule ? followupDue(appliedAt, settings.followupDays, tz) : prep.followupDueAt
  await saveProgress(userId, prep, progress, now)
  await prepsQ.save(userId, applicationId, {
    appliedAt,
    ...(reschedule ? { followupDueAt, followupStatus: 'pending' } : {}),
  })
  logger.info('marked_applied', {
    userId,
    applicationId,
    documents: used.length,
    followupDays: reschedule ? settings.followupDays : 0,
  })
  return { appliedAt, followupDueAt: followupDueAt ?? null, progress }
}
