'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth/require-session'
import { getAIProviderForUser } from '@/lib/ai'
import { logger } from '@/lib/logger'
import {
  CompanyActionError,
  dismissCompany,
  restoreCompany,
  saveCompany,
  trackSpeculative,
  watchCareers,
  watchJobs,
} from '@/lib/company-discovery/actions'
import { draftReachOut } from '@/lib/company-discovery/reach-out'
import type { SpeculativeDraft } from '@/lib/company-discovery/outreach'
import { parsePastedCompanies, MAX_PASTE_CHARS } from '@/lib/company-discovery/sources/paste'
import { storeCandidates } from '@/lib/company-discovery/service'
import { enqueueCompanyDiscoveryNow, enqueueEnrichment } from '@/lib/company-discovery/schedule'
import { DISMISS_REASONS } from '@/lib/company-discovery/types'
import { candidateFromChoice, MAX_QUERY, resolveCompanyName, type ResolveOption } from '@/lib/company-discovery/search'
import { fixtureOptions, lookupFixturesEnabled } from '@/lib/company-discovery/search-fixtures'
import { isIndustry } from '@/lib/company-discovery/industry'
import { isRegionId } from '@/lib/regions/tree'

/**
 * Discovery › Companies actions. Each validates its input, is user-scoped,
 * and maps any failure to a fixed, safe message (details go to the log).
 */

export type CompanyActionResult = { success: true; message?: string } | { error: string }

const id = z.string().uuid()

function failure(e: unknown, what: string): CompanyActionResult {
  if (e instanceof CompanyActionError) return { error: e.message }
  logger.error(`${what} failed`, { err: e instanceof Error ? e.name : 'unknown' })
  return { error: 'Something went wrong. Try again.' }
}

function refresh(): void {
  revalidatePath('/discoveries')
}

export async function watchCompanyJobs(companyId: string): Promise<CompanyActionResult> {
  try {
    const userId = await requireUserId()
    const r = await watchJobs(userId, id.parse(companyId))
    refresh()
    revalidatePath('/settings/sources')
    return { success: true, message: r.created ? 'Watching its job board: openings will appear in Discovery › Jobs.' : 'Already watching this job board.' }
  } catch (e) {
    return failure(e, 'watchCompanyJobs')
  }
}

export async function watchCompanyCareers(companyId: string): Promise<CompanyActionResult> {
  try {
    const userId = await requireUserId()
    const r = await watchCareers(userId, id.parse(companyId))
    refresh()
    return {
      success: true,
      message: r.changeDetection
        ? 'Added to "Check these yourself" (weekly). lee will also tell you when the page changes.'
        : 'Added to "Check these yourself" in Settings › Sources (weekly).',
    }
  } catch (e) {
    return failure(e, 'watchCompanyCareers')
  }
}

export async function saveLocalCompany(companyId: string): Promise<CompanyActionResult> {
  try {
    await saveCompany(await requireUserId(), id.parse(companyId))
    refresh()
    return { success: true }
  } catch (e) {
    return failure(e, 'saveLocalCompany')
  }
}

export async function dismissLocalCompany(companyId: string, reason: string | null): Promise<CompanyActionResult> {
  try {
    const r = reason === null ? null : z.enum(DISMISS_REASONS).parse(reason)
    await dismissCompany(await requireUserId(), id.parse(companyId), r)
    refresh()
    return { success: true }
  } catch (e) {
    return failure(e, 'dismissLocalCompany')
  }
}

export async function restoreLocalCompany(companyId: string): Promise<CompanyActionResult> {
  try {
    await restoreCompany(await requireUserId(), id.parse(companyId))
    refresh()
    return { success: true }
  } catch (e) {
    return failure(e, 'restoreLocalCompany')
  }
}

export type ReachOutResult =
  | { draft: SpeculativeDraft; people: Array<{ name: string; position: string }>; emails: string[]; variantName: string | null }
  | { error: string }

export async function draftCompanyReachOut(companyId: string, channel: 'email' | 'linkedin' | null): Promise<ReachOutResult> {
  try {
    const userId = await requireUserId()
    const ch = channel === null ? undefined : z.enum(['email', 'linkedin']).parse(channel)
    const ai = await getAIProviderForUser(userId).catch(() => null)
    const plan = await draftReachOut(userId, id.parse(companyId), { channel: ch, ai })
    return { draft: plan.draft, people: plan.people, emails: plan.emails, variantName: plan.facts.candidate.variantName }
  } catch (e) {
    const f = failure(e, 'draftCompanyReachOut')
    return 'error' in f ? f : { error: 'Something went wrong. Try again.' }
  }
}

export async function trackCompanySpeculative(companyId: string, channel: 'email' | 'linkedin', to: string | null): Promise<CompanyActionResult> {
  try {
    const userId = await requireUserId()
    const input = z.object({ channel: z.enum(['email', 'linkedin']), to: z.string().max(200).nullable() }).parse({ channel, to })
    await trackSpeculative(userId, id.parse(companyId), input)
    refresh()
    revalidatePath('/applications')
    return { success: true, message: 'Tracked as a speculative application; lee will remind you to follow up.' }
  } catch (e) {
    return failure(e, 'trackCompanySpeculative')
  }
}

export async function importCompaniesFromText(text: string): Promise<CompanyActionResult> {
  try {
    const userId = await requireUserId()
    const body = z.string().min(2).max(MAX_PASTE_CHARS).parse(text)
    const found = parsePastedCompanies(body)
    if (found.length === 0) return { error: 'No company names or websites found in the text.' }
    const r = await storeCandidates(userId, found)
    if (r.new > 0) await enqueueEnrichment(userId)
    refresh()
    return { success: true, message: `${r.new} added · ${found.length - r.new} already there or over the limit` }
  } catch (e) {
    return failure(e, 'importCompaniesFromText')
  }
}

export async function findCompaniesNow(): Promise<CompanyActionResult> {
  try {
    const queued = await enqueueCompanyDiscoveryNow(await requireUserId())
    return {
      success: true,
      message: queued ? 'Queued: new companies appear after the next background run.' : 'Already queued today.',
    }
  } catch (e) {
    return failure(e, 'findCompaniesNow')
  }
}

export type FindCompanyResult = { options: ResolveOption[] } | { error: string }

/** "Find a company": lee suggests matches (Wikidata, the seed list, website guesses); nothing is stored yet. */
export async function findCompanyByName(query: string): Promise<FindCompanyResult> {
  try {
    await requireUserId()
    const q = z.string().trim().min(2).max(MAX_QUERY).parse(query)
    const options = lookupFixturesEnabled(process.env) ? fixtureOptions(q) : await resolveCompanyName(q)
    return { options }
  } catch (e) {
    if (e instanceof z.ZodError) return { error: 'Type a company name (2–80 characters).' }
    const f = failure(e, 'findCompanyByName')
    return 'error' in f ? f : { error: 'Something went wrong. Try again.' }
  }
}

const choiceSchema = z.object({
  name: z.string().trim().min(2).max(200),
  website: z.string().trim().max(300).nullable(),
  regionIds: z.array(z.string().max(60)).max(10),
  industries: z.array(z.string().max(40)).max(10),
  wikidataId: z.string().regex(/^Q\d{1,12}$/).optional(),
  founded: z.number().int().min(1800).max(2100).optional(),
  employees: z.number().int().positive().max(10_000_000).optional(),
})

/** The user confirmed one option: store it (or update the row lee already has) and queue its careers check. */
export async function addCompanyFromSearch(choice: unknown): Promise<CompanyActionResult> {
  try {
    const userId = await requireUserId()
    const c = choiceSchema.parse(choice)
    const candidate = candidateFromChoice({ ...c, regionIds: c.regionIds.filter(isRegionId), industries: c.industries.filter(isIndustry) })
    const r = await storeCandidates(userId, [candidate])
    if (r.new > 0) await enqueueEnrichment(userId)
    refresh()
    return { success: true, message: r.new > 0 ? `Added ${candidate.name}; its careers page is checked next.` : `${candidate.name} is already in your list (updated).` }
  } catch (e) {
    if (e instanceof z.ZodError) return { error: 'That choice could not be read. Search again.' }
    return failure(e, 'addCompanyFromSearch')
  }
}
