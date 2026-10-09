import * as companiesQ from '@/lib/db/queries/localCompanies'
import * as todosQ from '@/lib/db/queries/todos'
import { getAdapter } from '@/lib/discovery/adapters'
import { boardSource } from '@/lib/companies/ats-detect'
import { logger } from '@/lib/logger'
import { careersPageHash, findCareers, type CareersResult } from './careers'
import { companyErrorText, type CompanyHttpDeps } from './http'
import { domainOf, websiteOf } from './normalize'
import { fetchOrgDetails } from './sources/github'
import { industriesFromText, mergeIndustries } from './industry'
import { refreshFits } from './service'
import type { CompanyEvidence } from './types'

/**
 * SERVER-ONLY. Enrichment, a few companies per job (queued, bounded):
 * GitHub org details (website, languages) when the company came from
 * GitHub, then the careers-page finder (robots.txt first) and, for a
 * supported job board, the open-roles count through the existing adapter.
 */

export const ENRICH_PER_JOB = 6
/** Weekly careers-page change checks per user. */
export const CAREERS_CHECKS_PER_RUN = 15

export interface EnrichSummary {
  kind: 'company-enrich'
  checked: number
  careers: number
  boards: number
  blocked: number
  failed: number
  remaining: number
}

export interface EnrichDeps extends CompanyHttpDeps {
  deadline?: number
  limit?: number
  /** Count open roles on a board (tests stub it). */
  countOpenRoles?: (kind: string, config: Record<string, unknown>, userId: string) => Promise<number | null>
}

async function defaultCountOpenRoles(kind: string, config: Record<string, unknown>, userId: string): Promise<number | null> {
  const adapter = getAdapter(kind)
  if (!adapter) return null
  try {
    return (await adapter.fetch(config, { userId })).length
  } catch {
    return null
  }
}

interface Outcome {
  patch: companiesQ.CompanyPatch
  careers: CareersResult | null
}

async function enrichOne(userId: string, row: companiesQ.CompanyRow, deps: EnrichDeps): Promise<Outcome> {
  const evidence = { ...((row.evidence ?? {}) as CompanyEvidence) }
  let website = row.website
  let industry = row.industry
  let normalized = row.normalized as Record<string, unknown>
  if (evidence.githubLogin && !evidence.languages) {
    try {
      const d = await fetchOrgDetails(evidence.githubLogin, deps)
      evidence.languages = d.languages
      evidence.publicRepos = d.profile.publicRepos
      if (d.profile.description && !evidence.description) evidence.description = d.profile.description.slice(0, 200)
      industry = mergeIndustries(industry, industriesFromText(d.profile.description))
      if (!website && d.profile.website && domainOf(d.profile.website)) website = websiteOf(d.profile.website)
      if (d.profile.name) normalized = { ...normalized, name: d.profile.name }
    } catch (e) {
      evidence.careersNote = `GitHub: ${companyErrorText(e)}`
    }
  }
  if (!website) {
    return { careers: null, patch: { evidence: evidence as never, industry, normalized: normalized as never, enrichStatus: 'done', enrichedAt: new Date() } }
  }
  const careers = await findCareers(website, deps)
  if (careers.emails.length > 0) evidence.contactEmails = careers.emails
  if (careers.note) evidence.careersNote = careers.note
  else delete evidence.careersNote
  const src = careers.board ? boardSource(careers.board) : null
  if (src) {
    const n = await (deps.countOpenRoles ?? defaultCountOpenRoles)(src.kind, src.config, userId)
    if (n !== null) evidence.openRoles = n
  }
  return {
    careers,
    patch: {
      website,
      domain: domainOf(website),
      industry,
      normalized: { ...normalized, website, domain: domainOf(website) } as never,
      careersUrl: careers.careersUrl,
      atsKind: careers.board?.kind ?? null,
      atsSlug: careers.board?.slug ?? null,
      careersHash: careers.textHash,
      careersCheckedAt: careers.textHash ? new Date() : null,
      evidence: evidence as never,
      enrichStatus: careers.status === 'blocked' ? 'blocked' : 'done',
      enrichedAt: new Date(),
    },
  }
}

/** Enrich up to `limit` pending companies; returns counts and how many remain. */
export async function enrichPending(userId: string, deps: EnrichDeps = {}): Promise<EnrichSummary> {
  const rows = await companiesQ.pendingEnrichment(userId, deps.limit ?? ENRICH_PER_JOB)
  const s: EnrichSummary = { kind: 'company-enrich', checked: 0, careers: 0, boards: 0, blocked: 0, failed: 0, remaining: 0 }
  for (const row of rows) {
    if (deps.deadline !== undefined && Date.now() > deps.deadline) break
    try {
      const { patch, careers } = await enrichOne(userId, row, deps)
      await companiesQ.patchCompany(userId, row.id, patch)
      s.checked += 1
      if (careers?.status === 'found') s.careers += 1
      if (careers?.board) s.boards += 1
      if (careers?.status === 'blocked') s.blocked += 1
    } catch (e) {
      s.failed += 1
      await companiesQ.patchCompany(userId, row.id, { enrichStatus: 'failed', enrichedAt: new Date() })
      logger.warn('company_enrich_failed', { userId, err: companyErrorText(e) })
    }
  }
  if (s.checked > 0) await refreshFits(userId)
  s.remaining = await companiesQ.countPending(userId)
  logger.info('company_enrich_done', { userId, checked: s.checked, careers: s.careers, boards: s.boards, blocked: s.blocked })
  return s
}

/**
 * Weekly change check of watched careers pages (only rows whose page was
 * readable under robots.txt at enrichment). A changed page gets a to-do.
 */
export async function checkWatchedCareers(userId: string, deps: CompanyHttpDeps = {}, now: Date = new Date()): Promise<{ checked: number; changed: number }> {
  const rows = (await companiesQ.careersWatched(userId)).slice(0, CAREERS_CHECKS_PER_RUN)
  let changed = 0
  for (const row of rows) {
    if (!row.careersUrl) continue
    const hash = await careersPageHash(row.careersUrl, deps).catch(() => null)
    if (!hash) {
      await companiesQ.patchCompany(userId, row.id, { careersCheckedAt: now })
      continue
    }
    const moved = hash !== row.careersHash
    await companiesQ.patchCompany(userId, row.id, { careersHash: hash, careersCheckedAt: now, ...(moved ? { careersChangedAt: now } : {}) })
    if (moved) {
      changed += 1
      const name = String((row.normalized as { name?: unknown }).name ?? 'A company')
      await todosQ.create(userId, {
        title: `${name}: careers page changed — check for new openings`.slice(0, 200),
        notesMd: row.careersUrl,
        priority: 2,
        dueAt: now,
        tags: ['careers-watch'],
      })
    }
  }
  if (rows.length > 0) logger.info('company_careers_changed', { userId, checked: rows.length, changed })
  return { checked: rows.length, changed }
}
