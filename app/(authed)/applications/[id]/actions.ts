'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { updateStatus } from '@/lib/applications/service'
import { redirect } from 'next/navigation'
import { createStage, deleteStage, updateStage } from '@/lib/stages/service'
import {
  deleteApplication as svcDeleteApplication,
  updateApplicationDetails,
} from '@/lib/applications/manage'
import * as appsQ from '@/lib/db/queries/applications'
import { STAGE_KIND_VALUES } from '@/lib/stages/kinds'
import { logger } from '@/lib/logger'

// Stage status values that the UI is allowed to flip to. The DB accepts any
// string (schema uses `text`), but limiting the surface keeps the UI honest
// and the analytics buckets bounded.
const STAGE_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const
type StageStatus = (typeof STAGE_STATUSES)[number]

export type ActionResult = { success: true } | { error: string }

export async function changeStatus(
  applicationId: string,
  newStatus: string,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    await updateStatus({ userId, applicationId, newStatus })
    revalidatePath(`/applications/${applicationId}`)
    revalidatePath('/applications')
    revalidatePath('/')
    return { success: true }
  } catch (err) {
    logger.error('changeStatus failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not update status.' }
  }
}

const addStageSchema = z.object({
  applicationId: z.string().uuid(),
  kind: z.string().min(1),
  title: z.string().optional(),
  scheduledAt: z.string().optional(),
  durationMinutes: z.coerce.number().int().positive().optional().or(z.literal('')),
  meetingUrl: z.string().url().optional().or(z.literal('')),
})

/**
 * Backfill `applied_at` on an existing application — used when an app was
 * added to the tracker after it was actually applied. Accepts a plain
 * YYYY-MM-DD (from the inline date input) or a full ISO string; both are
 * normalized to the start of that UTC day so a picker-only value doesn't
 * accidentally record 00:00 in the server's local tz.
 */
export async function setAppliedAt(
  applicationId: string,
  date: string,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    if (typeof applicationId !== 'string' || applicationId.length === 0) {
      return { error: 'Application id is required.' }
    }
    const when = /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? new Date(`${date}T00:00:00Z`)
      : new Date(date)
    if (Number.isNaN(when.getTime())) {
      return { error: 'Invalid date.' }
    }
    const updated = await appsQ.setAppliedAt(userId, applicationId, when)
    if (!updated) return { error: 'Application not found.' }
    revalidatePath(`/applications/${applicationId}`)
    revalidatePath('/applications')
    revalidatePath('/')
    return { success: true }
  } catch (err) {
    logger.error('setAppliedAt failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not set applied date.' }
  }
}

export async function setStageStatus(
  stageId: string,
  status: string,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    if (!(STAGE_STATUSES as readonly string[]).includes(status)) {
      return { error: 'Invalid stage status.' }
    }
    const row = await updateStage({
      userId,
      id: stageId,
      patch: { status: status as StageStatus },
    })
    if (!row) return { error: 'Stage not found.' }
    revalidatePath(`/applications/${row.applicationId}`)
    return { success: true }
  } catch (err) {
    logger.error('setStageStatus failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not update stage status.' }
  }
}

export async function addStage(formData: FormData): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    const raw = Object.fromEntries(formData)
    const cleaned: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string' && v.length === 0) continue
      cleaned[k] = v
    }
    const parsed = addStageSchema.safeParse(cleaned)
    if (!parsed.success) return { error: 'Invalid stage details.' }
    await createStage({
      userId,
      applicationId: parsed.data.applicationId,
      kind: parsed.data.kind,
      title: parsed.data.title,
      scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : undefined,
      durationMinutes:
        typeof parsed.data.durationMinutes === 'number' ? parsed.data.durationMinutes : undefined,
      meetingUrl:
        typeof parsed.data.meetingUrl === 'string' && parsed.data.meetingUrl.length > 0
          ? parsed.data.meetingUrl
          : undefined,
    })
    revalidatePath(`/applications/${parsed.data.applicationId}`)
    return { success: true }
  } catch (err) {
    logger.error('addStage failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not add stage.' }
  }
}

// ---------------------------------------------------------------------------
// Job details + application edit / delete, stage edit / delete.
// ---------------------------------------------------------------------------

const idSchema = z.string().uuid()

/** '' → null; otherwise trimmed text capped at `max`. */
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null))

/** '' → null; otherwise a non-negative integer no larger than `max`. */
const nullableInt = (max: number, message: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null
      const n = Number(v)
      if (!Number.isInteger(n) || n < 0 || n > max) {
        ctx.addIssue({ code: 'custom', message })
        return z.NEVER
      }
      return n
    })

const REMOTE_TYPES = ['remote', 'hybrid', 'onsite', 'unknown'] as const
const EMPLOYMENT_TYPES = ['fulltime', 'contract', 'parttime', 'internship', 'unknown'] as const

const jobDetailsSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(300),
    sourceUrl: z.string().trim().url('Enter a valid job URL').max(2000),
    companyId: z.string().uuid().optional().or(z.literal('')),
    location: nullableText(300),
    remoteType: z.enum(REMOTE_TYPES).optional().or(z.literal('')),
    employmentType: z.enum(EMPLOYMENT_TYPES).optional().or(z.literal('')),
    salaryMin: nullableInt(100_000_000, 'Salary must be a whole number.'),
    salaryMax: nullableInt(100_000_000, 'Salary must be a whole number.'),
    salaryCurrency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/, 'Currency must be a 3-letter code')
      .optional()
      .or(z.literal('')),
    descriptionMd: nullableText(100_000),
    source: nullableText(100),
    interestLevel: nullableInt(5, 'Interest must be 1–5.'),
  })
  .refine((d) => d.salaryMin === null || d.salaryMax === null || d.salaryMax >= d.salaryMin, {
    message: 'Maximum salary must be at least the minimum.',
  })

/**
 * Edit the job an application points at (title, URL, company, location,
 * remote/employment type, salary, description) plus the application's own
 * source and interest. Blank optional fields are cleared.
 */
export async function updateJobDetails(
  applicationId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    if (!idSchema.safeParse(applicationId).success) return { error: 'Application not found.' }
    const parsed = jobDetailsSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid job details.' }
    const d = parsed.data
    const result = await updateApplicationDetails(
      userId,
      applicationId,
      {
        title: d.title,
        sourceUrl: d.sourceUrl,
        companyId: d.companyId || null,
        location: d.location,
        remoteType: d.remoteType || null,
        employmentType: d.employmentType || null,
        salaryMin: d.salaryMin,
        salaryMax: d.salaryMax,
        salaryCurrency: d.salaryCurrency ? d.salaryCurrency.toUpperCase() : null,
        descriptionMd: d.descriptionMd,
      },
      { source: d.source, interestLevel: d.interestLevel === 0 ? null : d.interestLevel },
    )
    if (!result.ok) {
      if (result.reason === 'company_not_found') return { error: 'Company not found.' }
      if (result.reason === 'duplicate_url') return { error: 'Another job already uses that URL.' }
      return { error: 'Application not found.' }
    }
    revalidatePath(`/applications/${applicationId}`)
    revalidatePath('/applications')
    revalidatePath('/')
    return { success: true }
  } catch (err) {
    logger.error('updateJobDetails failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not save job details.' }
  }
}

/** Delete + redirect to the list (same shape as deleteCompany). */
export async function deleteApplication(applicationId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    if (!idSchema.safeParse(applicationId).success) return { error: 'Application not found.' }
    const ok = await svcDeleteApplication(userId, applicationId)
    if (!ok) return { error: 'Application not found.' }
    revalidatePath('/applications')
    revalidatePath('/')
  } catch (err) {
    logger.error('deleteApplication failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not delete application.' }
  }
  redirect('/applications')
}

const stageDetailsSchema = z.object({
  kind: z.enum(STAGE_KIND_VALUES),
  title: nullableText(300),
  // The client converts its local datetime to ISO before submitting.
  scheduledAt: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null
      const d = new Date(v)
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: 'custom', message: 'Invalid date.' })
        return z.NEVER
      }
      return d
    }),
  durationMinutes: nullableInt(24 * 60, 'Duration must be in minutes.'),
  location: nullableText(300),
  meetingUrl: z.string().trim().url().max(2000).optional().or(z.literal('')),
  prepNotesMd: nullableText(20_000),
})

export async function updateStageDetails(stageId: string, formData: FormData): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    if (!idSchema.safeParse(stageId).success) return { error: 'Stage not found.' }
    const parsed = stageDetailsSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { error: 'Invalid stage details.' }
    const d = parsed.data
    const row = await updateStage({
      userId,
      id: stageId,
      patch: {
        kind: d.kind,
        title: d.title,
        scheduledAt: d.scheduledAt,
        durationMinutes: d.durationMinutes,
        location: d.location,
        meetingUrl: d.meetingUrl || null,
        prepNotesMd: d.prepNotesMd,
      },
    })
    if (!row) return { error: 'Stage not found.' }
    revalidatePath(`/applications/${row.applicationId}`)
    return { success: true }
  } catch (err) {
    logger.error('updateStageDetails failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not update stage.' }
  }
}

/** Removes the stage and, when it was pushed, its Google Calendar event. */
export async function deleteStageAction(stageId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    if (!idSchema.safeParse(stageId).success) return { error: 'Stage not found.' }
    const ok = await deleteStage({ userId, id: stageId })
    if (!ok) return { error: 'Stage not found.' }
    revalidatePath('/applications/[id]', 'page')
    return { success: true }
  } catch (err) {
    logger.error('deleteStageAction failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return { error: 'Could not delete stage.' }
  }
}
