import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { documents } from '@/lib/db/schema'
import * as appsQ from '@/lib/db/queries/applications'
import * as prepsQ from '@/lib/db/queries/applicationPreps'
import * as profileQ from '@/lib/db/queries/profile'
import { readProfileLinks, suggestLinksForJob } from '@/lib/profile/links'
import { variantSummaries } from '@/lib/variants/service'
import { jobSignals, suggestVariant } from '@/lib/variants/suggest'
import { getUserTimeZone } from '@/lib/settings/timezone'
import { bestCvForApplication } from '@/lib/cv-fit/service'
import type { BestCv } from '@/lib/cv-fit/types'
import { photoViewForApplication, type PhotoView } from '@/lib/cv-fit/photo/service'
import { loadTailorView, type TailorView } from '@/lib/cv-fit/tailor/service'
import { logger } from '@/lib/logger'
import { buildChecklist, type ApplyChecklist } from './checklist'
import { localDay } from './dates'
import type { PrepProgress } from './progress'

/** Everything the Prepare step panel renders, serializable for the client. */
export interface PrepareView {
  applicationId: string
  started: boolean
  status: string
  jobTitle: string
  companyName: string | null
  progress: PrepProgress
  variants: Array<{ id: string; name: string; currentVersion: number }>
  suggestedVariantId: string | null
  suggestionReason: string
  currentVariantId: string | null
  links: Array<{ id: string; label: string; url: string; suggested: boolean; reason: string | null }>
  documents: Record<string, { id: string; title: string; version: number }>
  checklist: ApplyChecklist
  today: string
  appliedDay: string | null
  followupDueAt: string | null
  followupStatus: string | null
  /** Best CV for this job (lib/cv-fit); null without variants. */
  bestCv: BestCv | null
  photo: Pick<PhotoView, 'advice' | 'action'> | null
  /** "Tailor to this JD" (step 2); null when it could not be built. */
  tailor: TailorView | null
}

/** A failing extra must not take the whole page down: log and show the rest. */
async function soft<T>(what: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run()
  } catch (err) {
    logger.warn(`${what}_failed`, { err: err instanceof Error ? err.message : String(err) })
    return null
  }
}

export async function loadPrepareView(userId: string, applicationId: string, now: Date = new Date()): Promise<PrepareView | null> {
  const app = await appsQ.getById(userId, applicationId)
  if (!app) return null
  const [prep, variants, profile, tz, bestCv, photo, tailor] = await Promise.all([
    prepsQ.get(userId, applicationId),
    variantSummaries(userId),
    profileQ.get(userId),
    getUserTimeZone(userId),
    soft('prepare_best_cv', () => bestCvForApplication(userId, app, now)),
    soft('prepare_photo', () => photoViewForApplication(userId, app)),
    soft('prepare_tailor', () => loadTailorView(userId, applicationId)),
  ])
  const progress = prep?.progress ?? {}
  const suggestion = suggestVariant(
    variants,
    jobSignals({ title: app.job.title, location: app.job.location, remoteType: app.job.remoteType, descriptionMd: app.job.descriptionMd }),
  )
  const docIds = [progress.tailor?.documentId, progress.cover?.documentId].filter((d): d is string => Boolean(d))
  const docs = docIds.length
    ? await db
        .select({ id: documents.id, title: documents.title, version: documents.version })
        .from(documents)
        .where(and(eq(documents.userId, userId), inArray(documents.id, docIds)))
    : []
  const links = suggestLinksForJob(readProfileLinks(profile?.links), { title: app.job.title, description: app.job.descriptionMd })
  return {
    applicationId,
    started: prep !== null,
    status: app.status,
    jobTitle: app.job.title,
    companyName: app.job.company?.name ?? null,
    progress,
    variants: variants.map((v) => ({ id: v.id, name: v.name, currentVersion: v.currentVersion })),
    suggestedVariantId: suggestion.variant?.id ?? null,
    suggestionReason: suggestion.reason,
    currentVariantId: app.resumeVariantId,
    links: links.map((l) => ({ id: l.link.id, label: l.link.label, url: l.link.url, suggested: l.suggested, reason: l.reason })),
    documents: Object.fromEntries(docs.map((d) => [d.id, d])),
    checklist: buildChecklist({ applyUrl: app.job.sourceUrl, description: app.job.descriptionMd }),
    today: localDay(now, tz),
    appliedDay: prep?.appliedAt ? localDay(prep.appliedAt, tz) : app.appliedAt ? localDay(app.appliedAt, tz) : null,
    followupDueAt: prep?.followupDueAt?.toISOString() ?? null,
    followupStatus: prep?.followupStatus ?? null,
    bestCv,
    photo: photo ? { advice: photo.advice, action: photo.action } : null,
    tailor,
  }
}
