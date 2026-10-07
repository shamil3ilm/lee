import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { db, type DbClient } from '@/lib/db/client'
import { discoveries, jobRiskAssessments } from '@/lib/db/schema'
import { discoveryNotQuarantinedSql, discoveryQuarantinedSql } from '@/lib/db/queries/riskAssessments'
import * as repQ from '@/lib/db/queries/companyReputation'
import { classifyRole } from '@/lib/discovery/relevance/roles'
import { companyStructureCriterion, environmentCriterion } from '@/lib/reputation/criteria'
import type { SearchPrefs } from '@/lib/discovery/relevance/prefs'
import { GCC_CODES } from '@/lib/discovery/relevance/places'
import { companyKeyOf, feedbackAdjust, type FeedbackRow } from './feedback'
import type { RankCandidate } from './rank'

/**
 * Loads shortlist candidates: new or recent (≤ CANDIDATE_DAYS) job
 * discoveries still in the inbox or shortlisted, with only the columns the
 * rank needs (no description, no raw payload). Quarantined rows are
 * excluded in SQL and flagged for the pure eligibility check as well.
 */

export const CANDIDATE_DAYS = 14
export const MAX_CANDIDATES = 300

export interface Candidate extends RankCandidate {
  title: string
  companyKey: string | null
}

const n = (key: string) => sql<string | null>`${discoveries.normalized}->>${key}`

function toDate(v: string | null): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function asStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function hostOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

/** Region tags the user targets, from their search preferences. */
export function targetRegionTags(prefs: SearchPrefs): string[] {
  const tags = new Set<string>()
  if (prefs.regions.includes('AE')) tags.add('ae')
  if (prefs.regions.some((r) => GCC_CODES.includes(r))) tags.add('gcc')
  if (prefs.regions.includes('IN')) tags.add('in')
  if (prefs.active && prefs.remoteScope !== 'none') tags.add('remote')
  return [...tags]
}

type ReputationIndex = Map<string, { environment: number | null; stability: number | null }>

async function reputationIndex(userId: string, now: Date, client: DbClient): Promise<ReputationIndex> {
  const rows = await repQ.listWithCompany(userId, 1_000, client)
  const index: ReputationIndex = new Map()
  for (const r of rows) {
    const inputs = { ratings: r.record.userRatings, summary: r.record.summary, facts: r.record.facts }
    const value = { environment: environmentCriterion(inputs).score, stability: companyStructureCriterion(inputs, now).score }
    if (r.domain) index.set(r.domain.toLowerCase().replace(/^www\./, ''), value)
    index.set(r.name.trim().toLowerCase(), value)
  }
  return index
}

export async function loadCandidates(
  userId: string,
  input: { now: Date; feedback: readonly FeedbackRow[]; excludeIds?: ReadonlySet<string> },
  client: DbClient = db,
): Promise<Candidate[]> {
  const since = new Date(input.now.getTime() - CANDIDATE_DAYS * 24 * 60 * 60 * 1000)
  const [rows, reputation] = await Promise.all([
    client
      .select({
        id: discoveries.id,
        matchScore: discoveries.matchScore,
        regions: discoveries.regions,
        notes: discoveries.relevanceNotes,
        createdAt: discoveries.createdAt,
        title: n('title'),
        kind: n('kind'),
        companyName: n('companyName'),
        companyDomain: n('companyDomain'),
        applyUrl: n('applyUrl'),
        postedAt: n('postedAt'),
        techStack: sql<unknown>`${discoveries.normalized}->'techStack'`,
        riskLevel: jobRiskAssessments.level,
        quarantined: sql<boolean>`${discoveryQuarantinedSql()}`,
      })
      .from(discoveries)
      .leftJoin(
        jobRiskAssessments,
        and(
          eq(jobRiskAssessments.userId, discoveries.userId),
          eq(jobRiskAssessments.targetType, 'discovery'),
          eq(jobRiskAssessments.targetId, discoveries.id),
        ),
      )
      .where(
        and(
          eq(discoveries.userId, userId),
          inArray(discoveries.status, ['new', 'shortlisted']),
          gte(discoveries.createdAt, since),
          discoveryNotQuarantinedSql(),
        ),
      )
      .orderBy(
        desc(sql`(coalesce(${discoveries.matchScore}, 50) + ${discoveries.rankAdjust})`),
        desc(discoveries.createdAt),
      )
      .limit(MAX_CANDIDATES),
    reputationIndex(userId, input.now, client),
  ])

  return rows
    .filter((r) => r.kind === null || r.kind === 'job')
    .filter((r) => !input.excludeIds?.has(r.id))
    .map((r): Candidate => {
      const title = r.title ?? 'Untitled'
      const families = classifyRole({ title, techStack: asStrings(r.techStack) }).families
      const domain = r.companyDomain ?? hostOf(r.applyUrl)
      const companyKey = companyKeyOf({ companyDomain: r.companyDomain, companyName: r.companyName })
      const rep = (domain ? reputation.get(domain.toLowerCase().replace(/^www\./, '')) : undefined) ??
        (r.companyName ? reputation.get(r.companyName.trim().toLowerCase()) : undefined)
      const level = r.riskLevel === 'safe' || r.riskLevel === 'caution' || r.riskLevel === 'likely_scam' ? r.riskLevel : null
      return {
        id: r.id,
        title,
        companyKey,
        matchScore: r.matchScore,
        regions: r.regions ?? [],
        families,
        notes: (r.notes ?? {}) as RankCandidate['notes'],
        postedAt: toDate(r.postedAt),
        createdAt: r.createdAt,
        riskLevel: level,
        quarantined: Boolean(r.quarantined),
        filtered: false,
        reputation: rep ?? null,
        feedback: feedbackAdjust({ roleFamily: null, region: null, companyKey, families, regions: r.regions ?? [] }, input.feedback),
      }
    })
}
