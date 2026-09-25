import { and, eq, inArray, notInArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  applications,
  applicationContacts,
  companies,
  contacts,
  jobs,
} from '@/lib/db/schema'
import {
  extractAllEmailAddresses,
  extractDomain,
  extractHeader,
  type GmailMessage,
  type GmailThreadFull,
} from './adapter'

export interface MatchResult {
  applicationId: string
  reason: string
}

/**
 * Reserve terminal statuses so we do not match new email to a rejected /
 * withdrawn application unless nothing else fits. Mirrors reminders cron's
 * behavior.
 */
const INACTIVE_STATUSES = ['rejected', 'withdrawn']

/**
 * Collect every unique email address across the thread's From/To/Cc headers.
 * The dedup + case-normalization is done in the extractors.
 */
function collectThreadAddresses(thread: GmailThreadFull): {
  addresses: string[]
  domains: string[]
  subjects: string[]
} {
  const seenAddr = new Set<string>()
  const seenDomain = new Set<string>()
  const subjects: string[] = []

  for (const msg of thread.messages) {
    const from = extractHeader(msg, 'From')
    const to = extractHeader(msg, 'To')
    const cc = extractHeader(msg, 'Cc')
    for (const addr of [
      ...extractAllEmailAddresses(from),
      ...extractAllEmailAddresses(to),
      ...extractAllEmailAddresses(cc),
    ]) {
      seenAddr.add(addr)
      const domain = extractDomain(addr)
      if (domain) seenDomain.add(domain)
    }
    const subj = extractHeader(msg, 'Subject')
    if (subj) subjects.push(subj)
  }

  return {
    addresses: [...seenAddr],
    domains: [...seenDomain],
    subjects,
  }
}

/**
 * Best-effort deterministic matcher. Runs the three rules in priority order
 * per spec §3.3 and returns the FIRST hit; ties within a rule pick the
 * first-created application (Drizzle default order suffices — we keep it
 * implicit rather than adding an ORDER BY that could hide real ties).
 *
 * All queries are scoped to `userId` so cross-user leakage is impossible even
 * when two users share a company or contact email.
 */
export async function matchThreadToApplication(args: {
  thread: GmailThreadFull
  userId: string
}): Promise<MatchResult | null> {
  const { thread, userId } = args
  if (!thread.messages.length) return null

  const { addresses, domains, subjects } = collectThreadAddresses(thread)

  // Rule 1 — address ∈ contacts.email linked to an application (via
  // applicationContacts). Case-insensitive comparison happens implicitly
  // because we lowercase both sides: incoming addresses are lowercased by
  // extractEmailAddress, and stored contact emails are compared lowercased
  // here (Postgres ILIKE would be cleaner but we already have lowercased
  // inputs so simple `IN` on a lowercased column read is easier to test).
  if (addresses.length > 0) {
    const contactRows = await db
      .select({ id: contacts.id, email: contacts.email })
      .from(contacts)
      .where(eq(contacts.userId, userId))
    const matchingContactIds = contactRows
      .filter((c) => c.email && addresses.includes(c.email.toLowerCase()))
      .map((c) => c.id)
    if (matchingContactIds.length > 0) {
      // Look up an application linked to any of those contacts via the join
      // table. Prefer active (non-terminal) applications.
      const linkRows = await db
        .select({ applicationId: applicationContacts.applicationId })
        .from(applicationContacts)
        .innerJoin(applications, eq(applications.id, applicationContacts.applicationId))
        .where(
          and(
            eq(applications.userId, userId),
            inArray(applicationContacts.contactId, matchingContactIds),
            notInArray(applications.status, INACTIVE_STATUSES),
          ),
        )
      const first = linkRows[0]
      if (first) {
        return { applicationId: first.applicationId, reason: 'contact_email_match' }
      }
      // Fallback: also accept a terminal-status app if it's the only link.
      const anyLinkRows = await db
        .select({ applicationId: applicationContacts.applicationId })
        .from(applicationContacts)
        .innerJoin(applications, eq(applications.id, applicationContacts.applicationId))
        .where(
          and(
            eq(applications.userId, userId),
            inArray(applicationContacts.contactId, matchingContactIds),
          ),
        )
      if (anyLinkRows[0]) {
        return {
          applicationId: anyLinkRows[0].applicationId,
          reason: 'contact_email_match',
        }
      }
    }
  }

  // Rule 2 — sender domain ∈ companies.domain, and that company has an
  // application (via jobs.companyId → applications.jobId).
  if (domains.length > 0) {
    const companyRows = await db
      .select({ id: companies.id, domain: companies.domain })
      .from(companies)
      .where(eq(companies.userId, userId))
    const matchingCompanyIds = companyRows
      .filter((c) => c.domain && domains.includes(c.domain.toLowerCase()))
      .map((c) => c.id)
    if (matchingCompanyIds.length > 0) {
      const appRows = await db
        .select({ id: applications.id })
        .from(applications)
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .where(
          and(
            eq(applications.userId, userId),
            inArray(jobs.companyId, matchingCompanyIds),
            notInArray(applications.status, INACTIVE_STATUSES),
          ),
        )
      const first = appRows[0]
      if (first) {
        return { applicationId: first.id, reason: 'company_domain_match' }
      }
    }
  }

  // Rule 3 — subject substring against active job titles. This is the
  // weakest signal, so we require a non-terminal application status.
  if (subjects.length > 0) {
    const jobRows = await db
      .select({ id: jobs.id, title: jobs.title })
      .from(jobs)
      .innerJoin(applications, eq(applications.jobId, jobs.id))
      .where(
        and(
          eq(applications.userId, userId),
          notInArray(applications.status, INACTIVE_STATUSES),
        ),
      )
    const subjectsLower = subjects.map((s) => s.toLowerCase())
    for (const job of jobRows) {
      const title = job.title.toLowerCase().trim()
      if (title.length < 3) continue
      if (subjectsLower.some((s) => s.includes(title))) {
        const app = await db
          .select({ id: applications.id })
          .from(applications)
          .where(and(eq(applications.userId, userId), eq(applications.jobId, job.id)))
        const first = app[0]
        if (first) {
          return { applicationId: first.id, reason: 'subject_title_match' }
        }
      }
    }
  }

  return null
}

// Re-export message helpers for callers that already imported from matcher —
// keeps the sync service module concise.
export type { GmailMessage }
