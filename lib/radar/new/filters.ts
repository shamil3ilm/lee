import { isModelGroup, isNewCategory, type NewCategory } from './types'

/** /radar/new search params → filters (unknown values ignored). Client-safe, pure. */

export const PERIODS = [
  { value: 'today', label: 'Today', days: 1 },
  { value: 'week', label: 'This week', days: 7 },
  { value: 'month', label: 'This month', days: 30 },
] as const
export type Period = (typeof PERIODS)[number]['value']

export interface WhatsNewFilters {
  category: NewCategory | null
  /** Model group (llm, vision…), models only. */
  group: string | null
  openOnly: boolean
  relevantOnly: boolean
  period: Period
}

export interface ParsedNewParams {
  filters: WhatsNewFilters
  page: number
}

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? ''
}

export function periodDays(p: Period): number {
  return PERIODS.find((x) => x.value === p)?.days ?? 7
}

export function parseNewParams(sp: Record<string, string | string[] | undefined>): ParsedNewParams {
  const category = one(sp.category)
  const group = one(sp.group)
  const period = one(sp.period)
  const cat = isNewCategory(category) ? category : null
  return {
    filters: {
      category: cat,
      group: cat === 'model' && isModelGroup(group) ? group : null,
      openOnly: one(sp.open) === '1',
      relevantOnly: one(sp.relevant) === '1',
      period: PERIODS.some((p) => p.value === period) ? (period as Period) : 'week',
    },
    page: Math.max(0, Math.min(20, Number.parseInt(one(sp.page), 10) || 0)),
  }
}

export function newHref(f: WhatsNewFilters, page = 0): string {
  const q = new URLSearchParams()
  if (f.category) q.set('category', f.category)
  if (f.group) q.set('group', f.group)
  if (f.openOnly) q.set('open', '1')
  if (f.relevantOnly) q.set('relevant', '1')
  if (f.period !== 'week') q.set('period', f.period)
  if (page > 0) q.set('page', String(page))
  const s = q.toString()
  return s ? `/radar/new?${s}` : '/radar/new'
}
