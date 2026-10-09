import { BOARD_LABELS, type BoardKind } from '@/lib/companies/ats-detect'
import type { CompanyEvidence } from '../types'
import { combineGrowth } from './combine'
import { engineeringSignal, headcountSignal, hiringSignal, momentumSignal, newsSignal, stageSignal, type RoleSnapshot } from './signals'
import { tailwindSignal } from './tailwind'
import type { GrowthResult } from './types'

/**
 * Growth of one stored company: its facts → the seven signals → the
 * combined score. Pure, client-safe; the weekly refresh (./refresh.ts)
 * gathers the facts.
 */

export interface GrowthCompany {
  regionIds: readonly string[]
  industry: readonly string[]
  sizeBand: string | null
  atsKind: string | null
  sourceTags: readonly string[]
  evidence: CompanyEvidence
  roleSnapshots: readonly RoleSnapshot[]
}

export interface GrowthExtras {
  /** AI Radar "what's new" entries on the company's domain or GitHub org. */
  launches?: ReadonlyArray<{ d: string; u: string; t: string }>
  /** Classified news from the user's company reputation panel, merged with the company's own. */
  news?: ReadonlyArray<{ c: string; d: string; u: string; t: string }>
}

export function companyGrowth(c: GrowthCompany, now: Date, extras: GrowthExtras = {}): GrowthResult {
  const ev = c.evidence
  const news = [...(ev.news?.ev ?? []), ...(extras.news ?? [])]
  const funded = news.some((e) => e.c === 'funding' && now.getTime() - new Date(`${e.d}T00:00:00Z`).getTime() <= 365 * 86_400_000)
  const board = c.atsKind && c.atsKind in BOARD_LABELS ? BOARD_LABELS[c.atsKind as BoardKind] : null
  return combineGrowth([
    hiringSignal({ snapshots: c.roleSnapshots, boardLabel: board, jobsRecent30: ev.jobsRecent30, jobsPrior60: ev.jobsPrior60 }, now),
    newsSignal(news, now),
    engineeringSignal(ev.github, ev.githubLogin),
    headcountSignal(ev.headcount ?? [], c.sizeBand, now),
    stageSignal({ founded: ev.founded, ycBatch: ev.ycBatch, sourceTags: c.sourceTags, funded }, now),
    momentumSignal({ launches: extras.launches ?? [], hn: ev.hn }, now),
    tailwindSignal(c.industry, c.regionIds),
  ])
}

/** Append this week's open-role count; one per 7 days (a newer count replaces one under a week old), 26 weeks kept. */
export function withSnapshot(snaps: readonly RoleSnapshot[], n: number, now: Date, keepDays = 182): RoleSnapshot[] {
  const today = now.toISOString().slice(0, 10)
  const cutoff = now.getTime() - keepDays * 86_400_000
  const kept = snaps.filter((s) => new Date(`${s.d}T00:00:00Z`).getTime() >= cutoff)
  const last = kept[kept.length - 1]
  const recent = last && now.getTime() - new Date(`${last.d}T00:00:00Z`).getTime() < 6 * 86_400_000
  const base = recent ? kept.slice(0, -1) : kept
  return [...base, { d: today, n: Math.max(0, Math.min(10_000, Math.round(n))) }].slice(-27)
}

/** Lenient read of the stored snapshots. */
export function parseSnapshots(v: unknown): RoleSnapshot[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((s): RoleSnapshot[] => {
    const o = (s ?? {}) as { d?: unknown; n?: unknown }
    return typeof o.d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.d) && typeof o.n === 'number' && Number.isFinite(o.n) ? [{ d: o.d, n: o.n }] : []
  })
}
