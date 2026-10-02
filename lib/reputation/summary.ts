import type { AIProvider } from '@/lib/ai/types'
import type { ReputationSummaryInput, ReputationSummaryResult } from '@/lib/ai/prompts/reputation-summary'
import * as companiesQ from '@/lib/db/queries/companies'
import * as repQ from '@/lib/db/queries/companyReputation'
import type { ReputationRecord } from '@/lib/db/queries/companyReputation'
import { reassessCompanyPostings, safely } from '@/lib/scam/service'
import { logger } from '@/lib/logger'
import { ReputationError } from './errors'
import {
  ratingCiteId,
  summaryDraftSchema,
  type Claim,
  type CompanyFacts,
  type ConfirmedSummary,
  type SummaryDraft,
} from './types'

/**
 * AI reputation summary — generated only on demand, never saved as a
 * draft. The user edits the draft and confirms it; only then is it stored
 * (and fed to scoring and Scam Shield). Every claim must cite a signal the
 * panel shows: claims whose cites are unknown are dropped.
 */

/** Every id a claim may cite: fetched signals plus the user's own ratings. */
export function citableIds(record: ReputationRecord | null): Set<string> {
  if (!record) return new Set()
  return new Set([...record.signals.map((s) => s.id), ...record.userRatings.map((r) => ratingCiteId(r.site))])
}

function factsLine(facts: CompanyFacts | null): string | null {
  if (!facts) return null
  const parts = [
    facts.description,
    facts.founded ? `founded ${facts.founded.slice(0, 4)}` : null,
    facts.headquarters ? `HQ ${facts.headquarters}` : null,
    facts.employees !== null ? `~${facts.employees} employees` : null,
  ].filter(Boolean)
  return parts.length > 0 ? `(Wikidata: ${parts.join('; ')})` : null
}

export function buildSummaryInput(companyName: string, record: ReputationRecord): ReputationSummaryInput {
  return {
    companyName,
    facts: factsLine(record.facts),
    signals: [
      ...record.signals.map((s) => ({ id: s.id, source: s.source, title: s.title, date: s.date, category: s.category })),
      ...record.userRatings.map((r) => ({
        id: ratingCiteId(r.site),
        source: `your ${r.site} notes`,
        title: `${r.rating}/5${r.summary ? ` — ${r.summary}` : ''}`.slice(0, 600),
        date: r.recordedAt.slice(0, 10),
        category: null,
      })),
    ],
  }
}

function keepCited<T extends Claim>(claims: readonly T[], known: ReadonlySet<string>): T[] {
  return claims
    .map((c) => ({ ...c, text: c.text.trim().slice(0, 400), cites: [...new Set(c.cites.filter((id) => known.has(id)))].slice(0, 8) }))
    .filter((c) => c.text.length > 0 && c.cites.length > 0)
}

/** AI answer → a draft whose every claim cites known signals. */
export function sanitizeDraft(raw: ReputationSummaryResult, known: ReadonlySet<string>): SummaryDraft {
  return {
    pros: keepCited(raw.pros, known).slice(0, 8),
    cons: keepCited(raw.cons, known).slice(0, 8),
    redFlags: keepCited(
      raw.red_flags.map((f) => ({ ...f, gccRelevance: f.gcc_relevance.trim().slice(0, 400) })),
      known,
    )
      .map(({ category, text, cites, gccRelevance }) => ({ category, text, cites, gccRelevance }))
      .slice(0, 8),
    gccNote: raw.gcc_note.trim().slice(0, 600),
  }
}

export async function draftSummary(userId: string, companyId: string, ai: AIProvider): Promise<SummaryDraft> {
  const company = await companiesQ.getById(userId, companyId)
  if (!company) throw new ReputationError('Company not found.', 'not_found')
  const record = await repQ.get(userId, companyId)
  const known = citableIds(record)
  if (!record || known.size === 0) {
    throw new ReputationError('Refresh signals or record a rating first — the summary can only cite those.', 'no_signals')
  }
  const raw = await ai.summarizeReputation(buildSummaryInput(company.name, record), {
    userId,
    kind: 'company_reputation_summary',
  })
  return sanitizeDraft(raw, known)
}

/**
 * Save the user's edited draft. Rejects a claim without a valid citation
 * (the UI keeps citations attached to each claim), then re-assesses the
 * company's postings so a confirmed fraud / wage-theft flag reaches Scam
 * Shield right away.
 */
export async function confirmSummary(
  userId: string,
  companyId: string,
  draft: unknown,
  now: Date = new Date(),
): Promise<ConfirmedSummary> {
  const parsed = summaryDraftSchema.safeParse(draft)
  if (!parsed.success) throw new ReputationError('The summary is not valid. Check each claim.')
  const company = await companiesQ.getById(userId, companyId)
  if (!company) throw new ReputationError('Company not found.', 'not_found')
  const known = citableIds(await repQ.get(userId, companyId))
  const claims = [...parsed.data.pros, ...parsed.data.cons, ...parsed.data.redFlags]
  const uncited = claims.find((c) => c.cites.length === 0 || c.cites.some((id) => !known.has(id)))
  if (uncited) throw new ReputationError(`Every claim needs a source. Check: “${uncited.text.slice(0, 60)}”`)
  const summary: ConfirmedSummary = { ...parsed.data, confirmedAt: now.toISOString() }
  await repQ.saveSummary(userId, companyId, summary)
  logger.info('reputation_summary_confirmed', { redFlags: summary.redFlags.length })
  await safely('reputation_confirm', () => reassessCompanyPostings(userId, { id: company.id, name: company.name }))
  return summary
}

export async function clearSummary(userId: string, companyId: string): Promise<void> {
  const company = await companiesQ.getById(userId, companyId)
  if (!company) throw new ReputationError('Company not found.', 'not_found')
  await repQ.saveSummary(userId, companyId, null)
  await safely('reputation_clear', () => reassessCompanyPostings(userId, { id: company.id, name: company.name }))
}
