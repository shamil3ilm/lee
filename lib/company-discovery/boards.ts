import * as companiesQ from '@/lib/db/queries/localCompanies'
import { isReadableBoard, READABLE_BOARD_KINDS, type BoardKind } from '@/lib/companies/ats-detect'
import { isWithin } from '@/lib/regions/tree'
import { logger } from '@/lib/logger'
import { watchJobs, CompanyActionError } from './actions'
import { findCareers, type CareersResult } from './careers'
import { companyErrorText, type CompanyHttpDeps } from './http'
import { loadFitContext } from './service'
import { DEFAULT_TARGET_SELECTION } from './targets'
import type { CompanyEvidence } from './types'

/**
 * SERVER-ONLY. Weekly employer-board auto-detect: lee already knows
 * hundreds of companies (seed, maps, registers, park lists, employers seen
 * in jobs) but used to read only the boards someone set up. Once a week, a
 * bounded batch of companies in the user's regions (starred regions first)
 * gets its own website checked for a job board — robots.txt first, the home
 * page and the common careers paths, at most careers.MAX_PAGES pages each,
 * per-host spacing from the company limiter (lib/company-discovery/http.ts).
 *
 * A readable board (BambooHR, Greenhouse, Lever, Ashby, Workable, Recruitee,
 * Pinpoint, Workday, Teamtailor, Oracle) is attached to the company as
 * "Board found". Reading it is switched on automatically only for companies
 * in a STARRED region or that the user already watches; everywhere else it
 * is a suggestion ("Turn on" in the Companies tab and in Settings › Sources
 * › Coverage). Other ATSs (SmartRecruiters, Personio, Zoho, Taleo, iCIMS …)
 * are recorded and shown as links.
 */

export const BOARD_CHECKS_PER_RUN = 20
/** A company's site is re-checked at most once a week. */
export const BOARD_RECHECK_DAYS = 7
/** New sources switched on per run (each adds AI scoring work). */
export const AUTO_ENABLE_PER_RUN = 5

export interface BoardDetectSummary {
  kind: 'company-boards'
  checked: number
  found: number
  autoEnabled: number
  suggested: number
  blocked: number
  failed: number
  byKind: Record<string, number>
}

export interface BoardDetectDeps extends CompanyHttpDeps {
  deadline?: number
  limit?: number
  now?: Date
  /** Turn reading on (tests stub it). */
  enable?: (userId: string, companyId: string) => Promise<void>
  /** Find a board on a site (tests stub it). */
  find?: (website: string, deps: CompanyHttpDeps) => Promise<CareersResult>
}

/** True when any of the company's places lies in a starred region. */
export function inStarredRegion(regionIds: readonly string[], starredIds: readonly string[]): boolean {
  return regionIds.some((r) => starredIds.some((s) => isWithin(r, s)))
}

/** What a found board changes on the row (pure). */
export function boardPatch(row: companiesQ.CompanyRow, careers: CareersResult, now: Date): companiesQ.CompanyPatch {
  const evidence = { ...((row.evidence ?? {}) as CompanyEvidence) }
  const b = careers.board
  const patch: companiesQ.CompanyPatch = { boardCheckedAt: now }
  if (careers.note) evidence.careersNote = careers.note
  if (b) {
    const changed = row.atsKind !== b.kind || row.atsSlug !== b.slug
    if (changed) {
      patch.atsKind = b.kind
      patch.atsSlug = b.slug
      patch.careersUrl = b.url
      evidence.boardFound = { at: now.toISOString(), via: 'site' }
    }
  } else if (careers.careersUrl && !row.careersUrl) {
    patch.careersUrl = careers.careersUrl
  }
  patch.evidence = evidence as never
  return patch
}

async function defaultEnable(userId: string, companyId: string): Promise<void> {
  await watchJobs(userId, companyId)
}

export async function detectBoards(userId: string, deps: BoardDetectDeps = {}): Promise<BoardDetectSummary> {
  const now = deps.now ?? new Date()
  const s: BoardDetectSummary = { kind: 'company-boards', checked: 0, found: 0, autoEnabled: 0, suggested: 0, blocked: 0, failed: 0, byKind: {} }
  const { prefs } = await loadFitContext(userId)
  const starredIds = (prefs.extra.preferredRegions ?? []).map((p) => p.id)
  const regionIds = [...new Set([...(prefs.regionIds.length > 0 ? prefs.regionIds : DEFAULT_TARGET_SELECTION), ...starredIds])]
  const rows = await companiesQ.boardCandidates(userId, {
    regionIds,
    starredIds,
    staleBefore: new Date(now.getTime() - BOARD_RECHECK_DAYS * 86_400_000),
    limit: deps.limit ?? BOARD_CHECKS_PER_RUN,
  })
  const find = deps.find ?? findCareers
  const enable = deps.enable ?? defaultEnable
  for (const row of rows) {
    if (deps.deadline !== undefined && Date.now() > deps.deadline) break
    try {
      const careers = await find(row.website!, deps)
      await companiesQ.patchCompany(userId, row.id, boardPatch(row, careers, now))
      s.checked += 1
      if (careers.status === 'blocked') s.blocked += 1
      const b = careers.board
      if (!b) continue
      s.found += 1
      s.byKind[b.kind] = (s.byKind[b.kind] ?? 0) + 1
      if (!isReadableBoard(b.kind)) continue
      const auto = row.watch !== null || inStarredRegion(row.regionIds, starredIds)
      if (auto && s.autoEnabled < AUTO_ENABLE_PER_RUN) {
        try {
          await enable(userId, row.id)
          s.autoEnabled += 1
          const ev = { ...((row.evidence ?? {}) as CompanyEvidence), boardFound: { at: now.toISOString(), via: 'site' as const, auto: true } }
          await companiesQ.patchCompany(userId, row.id, { evidence: ev as never })
        } catch (e) {
          if (!(e instanceof CompanyActionError)) throw e
          s.suggested += 1
        }
      } else {
        s.suggested += 1
      }
    } catch (e) {
      s.failed += 1
      await companiesQ.patchCompany(userId, row.id, { boardCheckedAt: now }).catch(() => undefined)
      logger.warn('company_board_detect_failed', { userId, err: companyErrorText(e) })
    }
  }
  logger.info('company_board_detect_done', { userId, ...s, byKind: JSON.stringify(s.byKind) })
  return s
}

/**
 * Boards found since `since` (a job-news lead, an import) for companies in a
 * STARRED region: switched on, as the weekly detect does; at most
 * AUTO_ENABLE_PER_RUN. Elsewhere they stay suggestions.
 */
export async function enableFoundBoardsInStarred(userId: string, since: Date): Promise<number> {
  const { prefs } = await loadFitContext(userId)
  const starredIds = (prefs.extra.preferredRegions ?? []).map((p) => p.id)
  let enabled = 0
  for (const regionId of starredIds) {
    const rows = await companiesQ.suggestedBoards(userId, regionId, READABLE_BOARD_KINDS, 50)
    for (const row of rows) {
      if (enabled >= AUTO_ENABLE_PER_RUN) return enabled
      const ev = (row.evidence ?? {}) as CompanyEvidence
      const at = ev.boardFound?.at ? new Date(ev.boardFound.at) : null
      if (!at || at < since || ev.boardFound?.auto) continue
      try {
        await watchJobs(userId, row.id)
        await companiesQ.patchCompany(userId, row.id, { evidence: { ...ev, boardFound: { ...ev.boardFound!, auto: true } } as never })
        enabled += 1
      } catch (e) {
        if (!(e instanceof CompanyActionError)) throw e
      }
    }
  }
  return enabled
}

/** "Turn on" every suggested board in a region (the user's click is the confirmation). */
export async function enableSuggestedBoards(userId: string, regionId: string, limit = 50): Promise<{ enabled: number; sourceIds: string[] }> {
  const rows = await companiesQ.suggestedBoards(userId, regionId, READABLE_BOARD_KINDS, limit)
  const sourceIds: string[] = []
  for (const row of rows) {
    try {
      const r = await watchJobs(userId, row.id)
      sourceIds.push(r.sourceId)
    } catch (e) {
      if (!(e instanceof CompanyActionError)) throw e
    }
  }
  return { enabled: sourceIds.length, sourceIds }
}

/** Suggested-board counts per region id (Settings › Sources › Coverage). */
export async function suggestedBoardCounts(userId: string, regionIds: readonly string[]): Promise<Map<string, { count: number; kinds: BoardKind[] }>> {
  const out = new Map<string, { count: number; kinds: BoardKind[] }>()
  for (const id of regionIds) {
    const rows = await companiesQ.suggestedBoards(userId, id, READABLE_BOARD_KINDS, 200)
    out.set(id, { count: rows.length, kinds: [...new Set(rows.map((r) => r.atsKind as BoardKind))] })
  }
  return out
}
