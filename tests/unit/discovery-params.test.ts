import { describe, expect, it } from 'vitest'
import { DEFAULT_SORT, parseSort, SORT_LABELS, STATUS_LABELS } from '@/lib/discovery/filter-options'

/**
 * Discovery's sort and status vocabulary (review 2026-10-10 P0-8): Best fit
 * is the default; "Combined (Fit + benefits)" is hidden while no source
 * extracts benefits; "Needs a look" sits next to New.
 */
describe('Discovery sort', () => {
  it('defaults to Best fit and maps old ?sort=combined links to it', () => {
    expect(DEFAULT_SORT).toBe('match')
    expect(parseSort(undefined)).toBe('match')
    expect(parseSort('combined')).toBe('match')
    expect(parseSort('nonsense')).toBe('match')
    expect(parseSort('posted')).toBe('posted')
  })

  it('does not offer Combined', () => {
    expect(Object.keys(SORT_LABELS)).toEqual(['match', 'benefits', 'posted'])
  })
})

describe('Discovery statuses', () => {
  it('lists Needs a look right after New', () => {
    expect(Object.keys(STATUS_LABELS).slice(0, 2)).toEqual(['new', 'review'])
    expect(STATUS_LABELS.review).toBe('Needs a look')
  })
})
