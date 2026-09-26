import { fetchPage } from '@/lib/ingest/fetch'
import { firecrawlFetch } from '@/lib/ingest/firecrawl'
import { extractMainText } from '@/lib/ingest/html-clean'
import { env } from '@/lib/env'
import { db } from '@/lib/db/client'
import * as jobsQ from '@/lib/db/queries/jobs'
import * as companiesQ from '@/lib/db/queries/companies'
import * as appsQ from '@/lib/db/queries/applications'
import * as actQ from '@/lib/db/queries/activities'
import type { AIProvider } from '@/lib/ai'
import type { Application } from '@/lib/db/queries/applications'
import type { Job } from '@/lib/db/queries/jobs'
import type { Company } from '@/lib/db/queries/companies'
import type { Activity } from '@/lib/db/queries/activities'
import type { ParsedJob } from '@/lib/ai/types'
import { assessJob, netModeForUser, safely } from '@/lib/scam/service'

export interface CreateApplicationResult {
  application: Application
  job: Job
  company: Company
  activities: Activity[]
}

export async function createApplicationFromUrl(args: {
  userId: string
  url: string
  ai: AIProvider
}): Promise<CreateApplicationResult> {
  const { userId, url, ai } = args
  const page = await fetchPage(url)
  let text = extractMainText(page.html)
  // If the cleaned text is unusually short, the page is likely JS-rendered.
  // Fall back to Firecrawl (if configured) which executes JS and returns
  // markdown. If not configured, proceed with the short text and let the AI
  // do its best.
  if (text.length < 500 && env.FIRECRAWL_API_KEY) {
    const md = await firecrawlFetch(url)
    if (md && md.length > text.length) text = md
  }
  const parsed = await ai.parseJob(text)
  const domain = parsed.company_domain ?? new URL(page.finalUrl).hostname
  const saved = await saveParsedApplication({ userId, parsed, domain, text, finalUrl: page.finalUrl })
  // v17 §1 — Scam Shield on every created/updated job; never blocks the save.
  await safely('job_from_url', async () =>
    assessJob(userId, saved.job.id, { net: await netModeForUser(userId) }),
  )
  return saved
}

/**
 * Persist a parsed job listing atomically: company + job + application +
 * initial activity all commit together, so a mid-flight failure leaves no
 * orphaned rows. Extracted from createApplicationFromUrl so the network/AI
 * calls (which cannot participate in a DB transaction) stay outside the
 * transaction boundary.
 */
async function saveParsedApplication(args: {
  userId: string
  parsed: ParsedJob
  domain: string
  text: string
  finalUrl: string
}): Promise<CreateApplicationResult> {
  const { userId, parsed, domain, text, finalUrl } = args
  return db.transaction(async (tx) => {
    const company = await companiesQ.findOrCreateByDomain(userId, domain, parsed.company_name, tx)
    const job = await jobsQ.upsertBySourceUrl(
      userId,
      company.id,
      {
        title: parsed.title,
        sourceUrl: finalUrl,
        location: parsed.location ?? null,
        remoteType: parsed.remote_type,
        employmentType: parsed.employment_type,
        salaryMin: parsed.salary_min ?? null,
        salaryMax: parsed.salary_max ?? null,
        salaryCurrency: parsed.salary_currency ?? null,
        descriptionMd: text,
        parsedMeta: {
          seniority: parsed.seniority,
          tech_stack: parsed.tech_stack,
          responsibilities: parsed.responsibilities,
          requirements: parsed.requirements,
        },
        benefits: parsed.benefits,
      },
      tx,
    )
    const application = await appsQ.create(userId, { jobId: job.id, source: 'company_page' }, tx)
    await actQ.log(userId, application.id, 'status_change', { from: null, to: 'saved' }, tx)
    const activities = await actQ.list(userId, application.id, { limit: 10 }, tx)
    return { application, job, company, activities }
  })
}

export async function updateStatus(args: {
  userId: string
  applicationId: string
  newStatus: string
}): Promise<void> {
  const { userId, applicationId, newStatus } = args
  const updated = await appsQ.updateStatus(
    userId,
    applicationId,
    newStatus as Parameters<typeof appsQ.updateStatus>[2],
  )
  if (!updated) throw new Error('application not found')
}
