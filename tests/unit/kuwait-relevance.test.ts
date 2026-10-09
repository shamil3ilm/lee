import { describe, expect, it } from 'vitest'
import { detectNationalsOnly } from '@/lib/discovery/relevance/signals'
import { assessPay, parsePostedPay } from '@/lib/discovery/relevance/pay'
import { WATCH_EMPLOYERS } from '@/lib/defaults/watch-employers'
import { DEFAULT_SOURCES, DEFAULTS_VERSION } from '@/lib/defaults/catalog'

describe('Kuwait: nationals-only phrases', () => {
  it.each([
    'This role is for Kuwaiti nationals.',
    'Kuwaiti candidates only.',
    'The position is reserved for Kuwaiti candidates.',
    'Open for Kuwaitis only.',
    'This vacancy is for Kuwaitis.',
    'Kuwaitization role under the MGRP programme.',
    'Eligible under the Manpower and Government Restructuring Program.',
  ])('flags "%s"', (text) => {
    expect(detectNationalsOnly(text)).toBe('nationals only')
  })

  it.each([
    'Join the National Bank of Kuwait engineering team.',
    'Kuwaiti nationals are preferred; expatriates welcome to apply.',
    'Based in Kuwait City, open to candidates of all nationalities.',
    'Mine safety experience (MSHA) is a plus.',
  ])('does not flag "%s"', (text) => {
    expect(detectNationalsOnly(text)).toBeNull()
  })
})

describe('Kuwait: KWD pay', () => {
  it('reads a KWD monthly figure (dinar-class amounts are monthly below 6,000)', () => {
    expect(parsePostedPay({ description: 'Salary KWD 1,200 - 1,500' })).toMatchObject({ currency: 'KWD', min: 1200, max: 1500, period: 'month' })
    expect(parsePostedPay({ description: 'Package: KD 18,000' })).toMatchObject({ currency: 'KWD', period: 'year' })
  })

  it('shows an approximate AED equivalent for KWD, with or without a floor', () => {
    const pay = { min: 1_000, max: 1_200, currency: 'KWD' as const, period: 'month' as const }
    expect(assessPay(pay, null).figure).toMatch(/^KWD 1,000–1,200\/mo \(≈ AED 14,355\/mo, approx\.\)$/)
    const floor = { scope: 'GCC' as const, amount: 12_000, currency: 'AED' as const, period: 'month' as const }
    const r = assessPay(pay, floor)
    expect(r.figure).toContain('approx.')
    expect(r.below).toBe(false)
    expect(assessPay({ min: 500, max: 600, currency: 'KWD', period: 'month' }, floor).below).toBe(true)
  })

  it('SAR shows its AED equivalent, not marked approximate (a dollar peg)', () => {
    expect(assessPay({ min: 10_000, max: 10_000, currency: 'SAR', period: 'month' }, null).figure).toBe('SAR 10,000/mo (≈ AED 9,793/mo)')
  })
})

describe('Kuwait: employer watch list', () => {
  it('lists Kuwaiti employers with weekly watch links shipped in defaults v5', () => {
    const kw = WATCH_EMPLOYERS.filter((e) => e.country === 'KW').map((e) => e.key)
    expect(kw).toEqual(expect.arrayContaining(['koc', 'knpc', 'zain', 'nbk', 'kfh', 'boubyan', 'agility', 'alshaya', 'talabat', 'ooredoo-kuwait', 'stc-kuwait', 'tap-payments']))
    expect(DEFAULTS_VERSION).toBe(5)
    const v5 = DEFAULT_SOURCES.filter((s) => s.since === 5).map((s) => s.key)
    expect(v5).toEqual(expect.arrayContaining(['watch:kfh', 'watch:tap-payments']))
    // talabat was already a v2 watch link: not duplicated.
    expect(DEFAULT_SOURCES.filter((s) => s.key === 'watch:talabat')).toHaveLength(1)
  })
})
