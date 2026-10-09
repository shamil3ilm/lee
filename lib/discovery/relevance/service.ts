import * as profileQ from '@/lib/db/queries/profile'
import type { UserProfile } from '@/lib/db/queries/profile'
import * as relQ from '@/lib/db/queries/discoveryRelevance'
import type { GateColumns } from '@/lib/db/queries/discoveries'
import { getMasterCV } from '@/lib/documents/master'
import type { MasterCV } from '@/lib/documents/types'
import { evaluateRelevance, formatReasons, type GateInput } from './gate'
import { relevanceKey, searchPrefsFromProfile, type SearchPrefs } from './prefs'
import { suggestRoles, type SuggestionResult } from './suggest'

/**
 * Server side of the relevance gate: gate columns for ingest, batched
 * re-evaluation when preferences (or the rules) change, and role
 * suggestions from the profile + master CV.
 */

export interface RelevanceContext {
  prefs: SearchPrefs
  key: string
}

export function relevanceContext(profile: UserProfile | null): RelevanceContext {
  const prefs = searchPrefsFromProfile(profile)
  return { prefs, key: relevanceKey(prefs) }
}

/** Gate columns for one posting under the user's current preferences. */
export function gateColumns(job: GateInput, ctx: RelevanceContext): GateColumns {
  const r = evaluateRelevance(job, ctx.prefs)
  return {
    status: r.pass ? 'new' : 'filtered',
    filterReason: formatReasons(r.reasons),
    relevanceKey: ctx.key,
    regions: r.regions,
    regionIds: r.regionIds,
    relevanceNotes: { penalties: r.penalties, boosts: r.boosts, infos: r.infos },
    rankAdjust: r.rankAdjust,
  }
}

function asStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function asSalary(v: unknown): GateInput['salary'] {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as GateInput['salary']) : null
}

export interface ReevaluateResult {
  evaluated: number
  filtered: number
  /** More stale rows remain (deadline or row cap reached). */
  remaining: boolean
}

export const REEVALUATE_BATCH = 200

/**
 * Re-gate every discovery whose stored key differs from the current one,
 * in batches of REEVALUATE_BATCH (one read + one UPDATE each), until done,
 * `deadline` passes or `maxRows` were processed. When nothing stale is
 * left, the profile's applied key is stamped so page views skip the check.
 * Idempotent: rows already under the current key are never read again.
 */
export async function reevaluateRelevance(
  userId: string,
  opts: { deadline?: number; maxRows?: number; profile?: UserProfile | null } = {},
): Promise<ReevaluateResult> {
  const profile = opts.profile !== undefined ? opts.profile : await profileQ.get(userId)
  const ctx = relevanceContext(profile)
  const deadline = opts.deadline ?? Number.POSITIVE_INFINITY
  const maxRows = opts.maxRows ?? Number.POSITIVE_INFINITY
  let evaluated = 0
  let filtered = 0
  for (;;) {
    if (Date.now() >= deadline || evaluated >= maxRows) return { evaluated, filtered, remaining: true }
    const rows = await relQ.staleRows(userId, ctx.key, REEVALUATE_BATCH)
    if (rows.length === 0) break
    const updates = rows.map((r) => {
      const gate = gateColumns(
        {
          title: r.title ?? '',
          location: r.location,
          remoteType: r.remoteType,
          employmentType: r.employmentType,
          descriptionMd: r.descriptionMd,
          techStack: asStrings(r.techStack),
          salary: asSalary(r.salary),
        },
        ctx,
      )
      if (gate.status === 'filtered' && (r.status === 'new' || r.status === 'filtered') && !r.filterOverride) filtered += 1
      return { id: r.id, gate }
    })
    await relQ.applyGateBatch(userId, ctx.key, updates)
    evaluated += rows.length
    if (rows.length < REEVALUATE_BATCH) break
  }
  if (profile && profile.relevanceAppliedKey !== ctx.key) {
    await profileQ.upsert(userId, { relevanceAppliedKey: ctx.key })
  }
  return { evaluated, filtered, remaining: false }
}

/** Re-check progress for the Settings form: rows still waiting, rows filtered now. */
export async function relevanceProgress(userId: string): Promise<{ remaining: number; filtered: number }> {
  const ctx = relevanceContext(await profileQ.get(userId))
  return relQ.progress(userId, ctx.key)
}

/** True when stored discoveries may be gated under stale preferences. */
export function relevanceStale(profile: UserProfile | null): boolean {
  if (!profile) return false
  return profile.relevanceAppliedKey !== relevanceContext(profile).key
}

/**
 * The master CV (derived from the master profile: only interview-ready or
 * domain-worded items, so suggestions ignore evidence that only not-ready
 * items carry); null when missing.
 */
export async function loadMasterCv(userId: string): Promise<MasterCV | null> {
  return getMasterCV(userId)
}

/**
 * Deterministic role suggestions from the profile and the MASTER CV only.
 * Tailored CVs and cover letters are never read here.
 */
export async function loadRoleSuggestions(userId: string, profile?: UserProfile | null): Promise<SuggestionResult> {
  const [p, masterCv] = await Promise.all([
    profile !== undefined ? Promise.resolve(profile) : profileQ.get(userId),
    loadMasterCv(userId),
  ])
  return suggestRoles({ profile: p, masterCv })
}
