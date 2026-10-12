import { describe, expect, it } from 'vitest'
import { detectNationalsOnly } from '@/lib/discovery/relevance/signals'
import { assessPay, parsePostedPay } from '@/lib/discovery/relevance/pay'
import { WATCH_EMPLOYERS } from '@/lib/defaults/watch-employers'
import { DEFAULT_SOURCES, DEFAULTS_VERSION } from '@/lib/defaults/catalog'
import { getAdapter } from '@/lib/discovery/adapters'
import { SEED_COMPANIES } from '@/lib/company-discovery/seed'

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
  it('lists Kuwaiti employers; those with a public board are read automatically (defaults v6)', () => {
    const kw = WATCH_EMPLOYERS.filter((e) => e.country === 'KW').map((e) => e.key)
    expect(kw).toEqual(
      expect.arrayContaining(['koc', 'knpc', 'zain', 'nbk', 'kfh', 'boubyan', 'agility', 'alshaya', 'talabat', 'ooredoo-kuwait', 'stc-kuwait', 'tap-payments', 'alghanim', 'kuwait-airways']),
    )
    expect(DEFAULTS_VERSION).toBeGreaterThanOrEqual(6)
    const v6 = DEFAULT_SOURCES.filter((s) => s.since === 6)
    expect(v6.map((s) => s.key)).toEqual(expect.arrayContaining(['oracle_orc:gulfbank', 'oracle_orc:kfh', 'rss:boubyan', 'rss:tap-payments', 'workable:agility', 'watch:alghanim']))
    for (const s of v6.filter((x) => x.regions?.includes('kw') && x.kind !== 'watch')) {
      expect(s.enabled, s.key).toBe(true)
      expect(s.checkedOn).toBe('2026-10-09')
    }
    // Every adapter employer points at a source the catalog ships.
    for (const e of WATCH_EMPLOYERS.filter((x) => x.methods.includes('adapter'))) {
      expect(DEFAULT_SOURCES.some((s) => s.key === e.sourceKey), e.key).toBe(true)
    }
    // talabat was already a v2 watch link: not duplicated.
    expect(DEFAULT_SOURCES.filter((s) => s.key === 'watch:talabat')).toHaveLength(1)
  })
})

describe('Kuwait and UAE education and healthcare employers (defaults v7)', () => {
  it('ships the verified boards (Kuwait on, UAE off) and the job-news presets, each with an adapter', () => {
    expect(DEFAULTS_VERSION).toBe(7)
    // Watch links (check yourself) for employers with no readable board come from the watch list.
    expect(DEFAULT_SOURCES.filter((s) => s.since === 7 && s.kind === 'watch').map((s) => s.key)).toEqual(
      expect.arrayContaining(['watch:auk', 'watch:australian-university', 'watch:dar-al-shifa']),
    )
    const v7 = DEFAULT_SOURCES.filter((s) => s.since === 7 && s.kind !== 'watch')
    expect(v7.map((s) => [s.key, s.enabled])).toEqual([
      ['bamboohr:aiu', true],
      ['bamboohr:absedu', true],
      ['rss:taiba-hospital', true],
      ['oracle_orc:nmc', false],
      ['oracle_orc:aster', false],
      ['oracle_orc:zayed-university', false],
      ['oracle_orc:cud', false],
      ['wp_job_news:pravasinewsdaily', true],
      ['wp_job_news:pravasivarthakal', false],
    ])
    for (const s of v7) {
      expect(getAdapter(s.kind), s.key).not.toBeNull()
      expect(s.checkedOn).toBe('2026-10-12')
    }
    expect(WATCH_EMPLOYERS.find((e) => e.key === 'aiu-kuwait')).toMatchObject({ sourceKey: 'bamboohr:aiu', methods: ['adapter'] })
  })

  it('seeds AIU and the other campuses and hospitals with checkedOn and a note', () => {
    const names = SEED_COMPANIES.filter((s) => s.checkedOn === '2026-10-12').map((s) => s.name)
    expect(names).toEqual(
      expect.arrayContaining(['American International University', 'American University of Kuwait', 'Gulf University for Science and Technology', 'Australian University', 'Taiba Hospital', 'Dar Al Shifa Hospital', 'Al Seef Hospital', 'NMC Healthcare', 'Zayed University']),
    )
    expect(SEED_COMPANIES.find((s) => s.name === 'American International University')).toMatchObject({ website: 'https://www.aiu.edu.kw', regionIds: ['jahra'] })
  })
})
