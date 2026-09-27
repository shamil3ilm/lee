import type { ReputationRecord } from '@/lib/db/queries/companyReputation'
import type { ReputationSettings } from '@/lib/db/queries/reputationSettings'
import { DISPLAY_LOCALE } from '@/lib/ui/date'
import { ALARMING_NEWS } from './classify'
import { reputationCriteria, type CriterionScore } from './criteria'
import { reputationDeepLinks, type DeepLinkGroup } from './deep-links'
import {
  AUTO_SOURCES,
  SOURCE_LABELS,
  ratingCiteId,
  type AutoSource,
  type CompanyFacts,
  type ConfirmedSummary,
  type NewsCategory,
  type UserRating,
} from './types'

/**
 * Serializable view of a company's reputation for the panel (client
 * components receive only this). Dates are pre-formatted US style.
 */

export interface SignalView {
  id: string
  sourceLabel: string
  kind: string
  title: string
  url: string
  dateLabel: string | null
  category: NewsCategory | null
  alarming: boolean
}

export interface SourceStatusView {
  source: AutoSource
  label: string
  state: 'never' | 'ok' | 'error'
  atLabel: string | null
  count: number
  error: string | null
}

export interface ReputationView {
  companyId: string
  companyName: string
  fetchedAtLabel: string | null
  signals: SignalView[]
  statuses: SourceStatusView[]
  facts: CompanyFacts | null
  ratings: UserRating[]
  summary: ConfirmedSummary | null
  criteria: CriterionScore[]
  deepLinks: DeepLinkGroup[]
  /** Citation id → short label, for rendering and the summary editor. */
  citations: Record<string, string>
  places: { enabled: boolean; capLeft: number }
}

const DAY_FMT = new Intl.DateTimeFormat(DISPLAY_LOCALE, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const STAMP_FMT = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
  timeZoneName: 'short',
})

export function dayLabel(isoDay: string | null): string | null {
  if (!isoDay) return null
  const d = new Date(`${isoDay.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : DAY_FMT.format(d)
}

function stampLabel(iso: string | Date | null): string | null {
  if (!iso) return null
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return Number.isNaN(d.getTime()) ? null : STAMP_FMT.format(d)
}

export function buildReputationView(input: {
  companyId: string
  companyName: string
  record: ReputationRecord | null
  settings: ReputationSettings
  placesHardCap: number
  now?: Date
}): ReputationView {
  const r = input.record
  const signals = (r?.signals ?? []).map<SignalView>((s) => ({
    id: s.id,
    sourceLabel: SOURCE_LABELS[s.source],
    kind: s.kind,
    title: s.title,
    url: s.url,
    dateLabel: dayLabel(s.date),
    category: s.category,
    alarming: s.category !== null && ALARMING_NEWS.has(s.category),
  }))
  const statuses = AUTO_SOURCES.map<SourceStatusView>((source) => {
    const st = r?.sourceStatus[source]
    return {
      source,
      label: SOURCE_LABELS[source],
      state: !st ? 'never' : st.ok ? 'ok' : 'error',
      atLabel: stampLabel(st?.at ?? null),
      count: st?.count ?? 0,
      error: st?.error ?? null,
    }
  })
  const ratings = r?.userRatings ?? []
  const citations = Object.fromEntries([
    ...signals.map((s) => [s.id, `${s.sourceLabel}: ${s.title}`] as const),
    ...ratings.map((x) => [ratingCiteId(x.site), `Your ${x.site} notes (${x.rating}/5)`] as const),
  ])
  const s = input.settings
  const month = (input.now ?? new Date()).toISOString().slice(0, 7)
  const used = s.placesMonth === month ? s.placesCalls : 0
  return {
    companyId: input.companyId,
    companyName: input.companyName,
    fetchedAtLabel: stampLabel(r?.fetchedAt ?? null),
    signals,
    statuses,
    facts: r?.facts ?? null,
    ratings,
    summary: r?.summary ?? null,
    criteria: reputationCriteria({ ratings, summary: r?.summary ?? null, facts: r?.facts ?? null }, input.now),
    deepLinks: reputationDeepLinks(input.companyName),
    citations,
    places: { enabled: s.placesEnabled, capLeft: Math.max(0, Math.min(s.placesMonthlyCap, input.placesHardCap) - used) },
  }
}
