import { DEFAULT_SOURCES, sourceIdentity, type DefaultSource } from '@/lib/defaults/catalog'
import { WATCH_EMPLOYERS } from '@/lib/defaults/watch-employers'
import { isWithin } from '@/lib/regions/tree'
import { alertPresets } from './presets'
import type { RegionPlaybook } from './playbook-types'
import { defaultSourceRegions, reachFor, sourceReach } from './source-reach'

/**
 * Per-region coverage: how many sources can yield a region's jobs, what the
 * last week brought in, a green / amber / red status and the next steps.
 * Pure (the page passes in the DB facts). Client-safe.
 */

export type CoverageStatus = 'green' | 'amber' | 'red'

export interface CoverageSourceRow {
  id: string
  kind: string
  enabled: boolean
  config: Record<string, unknown>
}

export interface RegionActivity {
  /** Postings first seen in the window, by status ("new", "filtered", "shortlisted"…). */
  byStatus: Readonly<Record<string, number>>
  /** Companies in the Companies tab for the region (not dismissed). */
  companies: number
  /** Sources that yielded a posting in the region in the last 30 days. */
  yieldingSources: number
}

export type SuggestionKind = 'enable' | 'alert' | 'watch' | 'google-alert' | 'ai-mode'

export interface CoverageSuggestion {
  kind: SuggestionKind
  text: string
  /** A link (alert setup page, a Settings anchor). */
  href?: string
}

export interface RegionCoverage {
  id: string
  label: string
  status: CoverageStatus
  /** Region-specific sources switched on (employer boards, IT parks). */
  regionSources: number
  /** Broad sources switched on that can include it (search APIs, remote boards). */
  broadSources: number
  /** Set-up sources switched on (alert e-mails, Google Alerts…). */
  setupSources: number
  /** Catalog boards for the region the user has not switched on. */
  available: readonly DefaultSource[]
  /** Employers on the watch list for this region (checked by hand). */
  watchEmployers: number
  activity: RegionActivity
  /** Postings kept in the window (new + shortlisted + saved). */
  kept: number
  suggestions: CoverageSuggestion[]
  why: string
}

/** Thresholds: fewer than these makes a region amber. */
export const COVERAGE_TARGET = { regionSources: 3, keptPerWeek: 5 } as const

const KEPT = ['new', 'shortlisted', 'saved'] as const

function inCovers(ids: readonly string[], covers: readonly string[]): boolean {
  return ids.some((id) => covers.some((c) => isWithin(id, c)))
}

/** Catalog boards (pollable, not watch links) whose jobs are in the region. */
export function catalogBoardsFor(p: RegionPlaybook): DefaultSource[] {
  return DEFAULT_SOURCES.filter((d) => d.kind !== 'watch' && inCovers(defaultSourceRegions(d), p.covers))
}

function statusOf(regionSources: number, yielding: number, kept: number): CoverageStatus {
  if (regionSources === 0 && yielding === 0 && kept === 0) return 'red'
  if (regionSources < COVERAGE_TARGET.regionSources || kept < COVERAGE_TARGET.keptPerWeek) return 'amber'
  return 'green'
}

function whyOf(c: Pick<RegionCoverage, 'status' | 'regionSources' | 'kept' | 'label'>): string {
  if (c.status === 'red') return `No source lists ${c.label} jobs yet, and none arrived this week.`
  if (c.status === 'amber') {
    return c.regionSources < COVERAGE_TARGET.regionSources
      ? `Only ${c.regionSources} ${c.label} source${c.regionSources === 1 ? '' : 's'} switched on.`
      : `Only ${c.kept} ${c.label} posting${c.kept === 1 ? '' : 's'} this week.`
  }
  return `${c.regionSources} ${c.label} sources, ${c.kept} postings this week.`
}

export interface CoverageInput {
  playbook: RegionPlaybook
  sources: readonly CoverageSourceRow[]
  activity: RegionActivity
  /** Role phrase for alert presets ("Laravel developer"). */
  query: string
  /** Alert sites the user already receives alerts from (lib/email-alerts). */
  alertSitesSeen: ReadonlySet<string>
}

export function regionCoverage(i: CoverageInput): RegionCoverage {
  const p = i.playbook
  let regionSources = 0
  let broadSources = 0
  let setupSources = 0
  for (const s of i.sources) {
    if (!s.enabled) continue
    const r = reachFor(sourceReach(s.kind, s.config), p.covers)
    if (r === 'region') regionSources++
    else if (r === 'broad') broadSources++
    else if (r === 'setup') setupSources++
  }
  const enabledIds = new Set(i.sources.filter((s) => s.enabled).map((s) => sourceIdentity(s.kind, s.config)))
  const available = catalogBoardsFor(p).filter((d) => !enabledIds.has(sourceIdentity(d.kind, d.config)))
  const watchEmployers = WATCH_EMPLOYERS.filter((e) => p.covers.includes(e.country.toLowerCase()) && e.sourceKey.startsWith('watch:')).length
  const kept = KEPT.reduce((n, s) => n + (i.activity.byStatus[s] ?? 0), 0)
  const status = statusOf(regionSources, i.activity.yieldingSources, kept)
  const base = { status, regionSources, kept, label: p.label }
  return {
    id: p.id,
    label: p.label,
    status,
    regionSources,
    broadSources,
    setupSources,
    available,
    watchEmployers,
    activity: i.activity,
    kept,
    suggestions: status === 'green' ? [] : suggestionsFor(i, available, watchEmployers),
    why: whyOf(base),
  }
}

function suggestionsFor(i: CoverageInput, available: readonly DefaultSource[], watchEmployers: number): CoverageSuggestion[] {
  const p = i.playbook
  const out: CoverageSuggestion[] = []
  if (available.length > 0) {
    out.push({ kind: 'enable', text: `Turn on ${available.length} ${p.label} employer board${available.length === 1 ? '' : 's'}` })
  }
  const preset = alertPresets(p, i.query).find((a) => a.parsed && !i.alertSitesSeen.has(a.site)) ?? alertPresets(p, i.query).find((a) => a.parsed)
  if (preset) out.push({ kind: 'alert', text: `Set up a ${preset.label.replace(' · ', ' alert for ')}`, href: preset.url })
  if (watchEmployers > 0) {
    out.push({ kind: 'watch', text: `Check these ${watchEmployers} ${p.label} employers weekly`, href: '/settings/sources#employer-watch' })
  }
  out.push({ kind: 'google-alert', text: `Add a Google Alert for ${p.label}`, href: '/settings/sources#google-alerts' })
  return out.slice(0, 4)
}
