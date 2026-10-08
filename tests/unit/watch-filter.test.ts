import { describe, expect, it } from 'vitest'
import { filterWatchRows, howLeeChecks, otherMethods, watchSummary } from '@/lib/defaults/watch-filter'
import type { EmployerWatchRow } from '@/lib/defaults/watch-status'

function row(over: Partial<EmployerWatchRow>): EmployerWatchRow {
  return {
    key: 'k',
    name: 'Acme',
    country: 'AE',
    sector: 'energy',
    backend: 'Custom',
    methods: ['manual'],
    careersUrl: 'https://example.test/careers',
    alertSignupUrl: null,
    note: '',
    sourceId: 's1',
    polled: false,
    watching: true,
    status: 'checked',
    lastSeenAt: null,
    lastCheckedAt: null,
    ...over,
  }
}

const ROWS = [
  row({ key: 'a', name: 'Alpha Airways', country: 'AE', status: 'check_due' }),
  row({ key: 'b', name: 'Beta Energy', country: 'SA', watching: false, status: 'off' }),
  row({ key: 'c', name: 'Gamma Bank', country: 'QA', status: 'error', polled: true, methods: ['adapter'] }),
]

describe('employer watch filter', () => {
  it('searches by name and country name', () => {
    expect(filterWatchRows(ROWS, { text: 'energy', filter: 'all', country: '' }).map((r) => r.key)).toEqual(['b'])
    expect(filterWatchRows(ROWS, { text: 'qatar', filter: 'all', country: '' }).map((r) => r.key)).toEqual(['c'])
  })

  it('filters by state and country', () => {
    expect(filterWatchRows(ROWS, { text: '', filter: 'check_due', country: '' }).map((r) => r.key)).toEqual(['a'])
    expect(filterWatchRows(ROWS, { text: '', filter: 'not_watching', country: '' }).map((r) => r.key)).toEqual(['b'])
    expect(filterWatchRows(ROWS, { text: '', filter: 'watching', country: 'QA' }).map((r) => r.key)).toEqual(['c'])
  })

  it('summarises in one line', () => {
    expect(watchSummary(ROWS)).toBe('3 employers · 2 watched · 1 check due · 1 failing')
  })

  it('names one plain method, the rest for details', () => {
    expect(howLeeChecks(['adapter'])).toBe('Daily feed')
    expect(howLeeChecks(['alert', 'ai_search', 'manual'])).toBe('Email alerts')
    expect(otherMethods(['alert', 'ai_search', 'manual'])).toEqual(['Weekly AI search', 'Check weekly'])
  })
})
