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
}

export async function loadPrepareView(userId: string, applicationId: string, now: Date = new Date()): Promise<PrepareView | null> {
  const app = await appsQ.getById(userId, applicationId)
  if (!app) return null
  const [prep, variants, profile, tz] = await Promise.all([
    prepsQ.get(userId, applicationId),
    variantSummaries(userId),
    profileQ.get(userId),
    getUserTimeZone(userId),
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
  }
}
