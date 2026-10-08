import type { FeedFilters } from '@/lib/db/queries/radarFeed'
import { isRadarKind, isRadarSource } from './types'

/** /radar search params → feed filters (unknown values are ignored). Pure. */

export const SINCE_OPTIONS = [
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '', label: 'Any time' },
] as const

export interface ParsedFeedParams {
  filters: FeedFilters
  page: number
  /** The raw values, for the form's defaults and the pager links. */
  raw: { source: string; type: string; watched: boolean; saved: boolean; since: string }
}

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? ''
}

export function parseFeedParams(sp: Record<string, string | string[] | undefined>): ParsedFeedParams {
  const source = one(sp.source)
  const type = one(sp.type)
  const since = one(sp.since)
  const watched = one(sp.watched) === '1'
  const saved = one(sp.saved) === '1'
  const page = Math.max(0, Math.min(50, Number.parseInt(one(sp.page), 10) || 0))
  const sinceDays = ['1', '7', '30'].includes(since) ? Number(since) : undefined
  return {
    filters: {
      ...(isRadarSource(source) ? { source } : {}),
      ...(isRadarKind(type) ? { kind: type } : {}),
      ...(watched ? { watched } : {}),
      ...(saved ? { saved } : {}),
      ...(sinceDays ? { sinceDays } : {}),
    },
    page,
    raw: {
      source: isRadarSource(source) ? source : '',
      type: isRadarKind(type) ? type : '',
      watched,
      saved,
      since: sinceDays ? since : '',
    },
  }
}

/** Query string for a page of the same filters. */
export function feedHref(raw: ParsedFeedParams['raw'], page: number): string {
  const q = new URLSearchParams()
  if (raw.source) q.set('source', raw.source)
  if (raw.type) q.set('type', raw.type)
  if (raw.watched) q.set('watched', '1')
  if (raw.saved) q.set('saved', '1')
  if (raw.since) q.set('since', raw.since)
  if (page > 0) q.set('page', String(page))
  const s = q.toString()
  return s ? `/radar?${s}` : '/radar'
}
