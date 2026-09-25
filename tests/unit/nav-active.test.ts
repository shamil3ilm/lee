import { describe, it, expect } from 'vitest'
import { isGroupOpen, parseGroupState, pickActiveHref } from '@/lib/ui/nav-active'
import { ALL_NAV_HREFS } from '@/components/nav/nav-config'

const HREFS = ['/', '/documents', '/documents/merge', '/expenses', '/settings', '/playground']

describe('pickActiveHref', () => {
  it('matches root only exactly', () => {
    expect(pickActiveHref('/', HREFS)).toBe('/')
    expect(pickActiveHref('/unknown', HREFS)).toBeNull()
  })
  it('prefers the longest prefix', () => {
    expect(pickActiveHref('/documents/merge', HREFS)).toBe('/documents/merge')
    expect(pickActiveHref('/documents/abc/edit', HREFS)).toBe('/documents')
  })
  it('matches nested routes under a parent entry', () => {
    expect(pickActiveHref('/expenses/budgets', HREFS)).toBe('/expenses')
    expect(pickActiveHref('/settings/profile', HREFS)).toBe('/settings')
  })
  it('does not match partial segment names', () => {
    expect(pickActiveHref('/playgrounds', HREFS)).toBeNull()
  })
})

describe('pickActiveHref with the real sidebar config', () => {
  it('lights the Playground hub only on the hub itself', () => {
    expect(pickActiveHref('/playground', ALL_NAV_HREFS)).toBe('/playground')
  })
  it('lights Models for every model playground route', () => {
    expect(pickActiveHref('/playground/models', ALL_NAV_HREFS)).toBe('/playground/models')
    expect(pickActiveHref('/playground/models/arena', ALL_NAV_HREFS)).toBe('/playground/models')
    expect(pickActiveHref('/playground/models/runs/abc', ALL_NAV_HREFS)).toBe('/playground/models')
  })
  it('lights Decisions for the decisions playground', () => {
    expect(pickActiveHref('/playground/decisions', ALL_NAV_HREFS)).toBe('/playground/decisions')
  })
  it('no longer knows the retired /learn and /lab routes', () => {
    expect(ALL_NAV_HREFS).not.toContain('/learn')
    expect(pickActiveHref('/lab/arena', ALL_NAV_HREFS)).toBeNull()
  })
})

describe('parseGroupState', () => {
  it('returns {} for null/invalid/non-object JSON', () => {
    expect(parseGroupState(null)).toEqual({})
    expect(parseGroupState('{oops')).toEqual({})
    expect(parseGroupState('[1,2]')).toEqual({})
    expect(parseGroupState('"x"')).toEqual({})
  })
  it('keeps only boolean values', () => {
    expect(parseGroupState('{"find":false,"apply":true,"x":1}')).toEqual({
      find: false,
      apply: true,
    })
  })
})

describe('isGroupOpen', () => {
  it('defaults to open', () => {
    expect(isGroupOpen('find', {}, false)).toBe(true)
  })
  it('respects persisted closed state', () => {
    expect(isGroupOpen('find', { find: false }, false)).toBe(false)
  })
  it('forces open when the group contains the active route', () => {
    expect(isGroupOpen('find', { find: false }, true)).toBe(true)
  })
})
