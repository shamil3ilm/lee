import { fetchPage } from '@/lib/ingest/fetch'
import { firecrawlFetch } from '@/lib/ingest/firecrawl'
import { extractMainText } from '@/lib/ingest/html-clean'
import { env } from '@/lib/env'
import * as jobsQ from '@/lib/db/queries/jobs'
import * as companiesQ from '@/lib/db/queries/companies'
import * as appsQ from '@/lib/db/queries/applications'
import * as actQ from '@/lib/db/queries/activities'
import type { AIProvider } from '@/lib/ai'
import type { Application } from '@/lib/db/queries/applications'
import type { Job } from '@/lib/db/queries/jobs'
import type { Company } from '@/lib/db/queries/companies'
import type { Activity } from '@/lib/db/queries/activities'

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
  const company = await companiesQ.findOrCreateByDomain(userId, domain, parsed.company_name)
  const job = await jobsQ.upsertBySourceUrl(userId, company.id, {
    title: parsed.title,
    sourceUrl: page.finalUrl,
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
  })
  const application = await appsQ.create(userId, { jobId: job.id, source: 'company_page' })
  await actQ.log(userId, application.id, 'status_change', { from: null, to: 'saved' })
  const activities = await actQ.list(userId, application.id, { limit: 10 })
  return { application, job, company, activities }
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
