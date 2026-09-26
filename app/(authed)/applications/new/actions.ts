'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { createApplicationFromUrl } from '@/lib/applications/service'
import { getAIProviderForUser } from '@/lib/ai'
import { withAiUsage } from '@/lib/ai/usage'
import type { AiUsage } from '@/lib/ai/usage-types'
import { db } from '@/lib/db/client'
import * as companiesQ from '@/lib/db/queries/companies'
import * as jobsQ from '@/lib/db/queries/jobs'
import * as appsQ from '@/lib/db/queries/applications'
import * as actQ from '@/lib/db/queries/activities'
import { logger } from '@/lib/logger'
import { assessJob, netModeForUser, safely } from '@/lib/scam/service'

export type ActionResult =
  | { success: true; applicationId: string; usage?: AiUsage | null }
  | { error: string }

const urlSchema = z.object({ url: z.string().url() })

export async function addFromUrl(formData: FormData): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    const parsed = urlSchema.safeParse({ url: formData.get('url') })
    if (!parsed.success) return { error: 'Please enter a valid URL.' }
    const ai = await getAIProviderForUser(userId)
    const { result, usage } = await withAiUsage({ userId }, () =>
      createApplicationFromUrl({
        userId,
        url: parsed.data.url,
        ai,
      }),
    )
    revalidatePath('/applications')
    return { success: true, applicationId: result.application.id, usage }
  } catch (err) {
    logger.error('addFromUrl failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not parse that page. Try Manual entry.' }
  }
}

const manualSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  companyName: z.string().min(1, 'Company name is required'),
  sourceUrl: z.string().url('Source URL is required'),
  location: z.string().optional(),
  remoteType: z.string().optional(),
  employmentType: z.string().optional(),
  description: z.string().optional(),
})

export async function addManually(formData: FormData): Promise<ActionResult> {
  try {
    const userId = await requireUserId()
    const raw = Object.fromEntries(formData) as Record<string, string>
    const parsed = manualSchema.safeParse(raw)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      return { error: first?.message ?? 'Invalid input.' }
    }
    const domain = new URL(parsed.data.sourceUrl).hostname

    const result = await db.transaction(async (tx) => {
      const company = await companiesQ.findOrCreateByDomain(
        userId,
        domain,
        parsed.data.companyName,
        tx,
      )
      const job = await jobsQ.upsertBySourceUrl(
        userId,
        company.id,
        {
          title: parsed.data.title,
          sourceUrl: parsed.data.sourceUrl,
          location: parsed.data.location || null,
          remoteType: parsed.data.remoteType || null,
          employmentType: parsed.data.employmentType || null,
          salaryMin: null,
          salaryMax: null,
          salaryCurrency: null,
          descriptionMd: parsed.data.description || null,
          parsedMeta: {},
          benefits: {},
        },
        tx,
      )
      const application = await appsQ.create(
        userId,
        { jobId: job.id, source: 'manual' },
        tx,
      )
      await actQ.log(userId, application.id, 'status_change', { from: null, to: 'saved' }, tx)
      return application
    })
    // v17 §1 — Scam Shield on the new/updated job; never blocks the save.
    await safely('job_manual', async () =>
      assessJob(userId, result.jobId, { net: await netModeForUser(userId) }),
    )

    revalidatePath('/applications')
    return { success: true, applicationId: result.id }
  } catch (err) {
    logger.error('addManually failed', { err: err instanceof Error ? err.message : String(err) })
    return { error: 'Could not save the application. Please try again.' }
  }
}
