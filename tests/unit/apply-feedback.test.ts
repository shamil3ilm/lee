import { describe, expect, it } from 'vitest'
import { companyKeyOf, feedbackAdjust, isDismissReason, prefSuggestions, type FeedbackRow } from '@/lib/apply/feedback'

const row = (over: Partial<FeedbackRow>): FeedbackRow => ({
  reason: 'other',
  roleFamily: null,
  region: null,
  companyKey: null,
  ...over,
})

describe('dismiss-reason feedback', () => {
  it('validates reasons', () => {
    expect(isDismissReason('role')).toBe(true)
    expect(isDismissReason('nope')).toBe(false)
  })

  it('keys a company by domain, else by name', () => {
    expect(companyKeyOf({ companyDomain: 'WWW.Example.com', companyName: 'Example' })).toBe('example.com')
    expect(companyKeyOf({ companyName: '  Acme Corp ' })).toBe('acme corp')
    expect(companyKeyOf({})).toBeNull()
  })

  it('lowers a company the user passed on after one dismissal', () => {
    const adj = feedbackAdjust({ roleFamily: null, region: null, companyKey: 'acme.io' }, [row({ reason: 'company', companyKey: 'acme.io' })])
    expect(adj).toEqual([{ points: -15, label: 'You passed on this company' }])
  })

  it('lowers a role family or region only after repeated dismissals for that reason', () => {
    const once = [row({ reason: 'role', roleFamily: 'frontend' })]
    const twice = [...once, row({ reason: 'role', roleFamily: 'frontend' })]
    const target = { roleFamily: null, region: null, companyKey: null, families: ['frontend'], regions: ['in'] }
    expect(feedbackAdjust(target, once)).toEqual([])
    expect(feedbackAdjust(target, twice).map((a) => a.points)).toEqual([-8])
    const places = [row({ reason: 'location', region: 'in' }), row({ reason: 'location', region: 'in' })]
    expect(feedbackAdjust(target, places)).toEqual([{ points: -8, label: 'You passed on this location' }])
  })

  it('does not count a different reason against the same key', () => {
    const rows = [row({ reason: 'pay', companyKey: 'acme.io' })]
    expect(feedbackAdjust({ roleFamily: null, region: null, companyKey: 'acme.io' }, rows)).toEqual([])
  })

  it('suggests (never applies) preference changes after three of the same reason', () => {
    const rows = [
      ...Array.from({ length: 3 }, () => row({ reason: 'role', roleFamily: 'frontend' })),
      ...Array.from({ length: 3 }, () => row({ reason: 'pay' })),
      row({ reason: 'seniority' }),
    ]
    const s = prefSuggestions(rows, ['frontend', 'backend'])
    expect(s.map((x) => x.id)).toEqual(['role:frontend', 'pay'])
    expect(s[0]?.text).toContain('Remove Frontend from your target roles?')
    expect(s.every((x) => x.href === '/settings/profile#search-preferences')).toBe(true)
  })
})
