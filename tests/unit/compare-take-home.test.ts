import { describe, expect, it } from 'vitest'
import { payRatio, takeHome } from '@/lib/compare/take-home'
import { assumptionsSchema } from '@/lib/compare/types'

const assumptions = assumptionsSchema.parse({
  fx: { rates: { INR: 83 }, updatedAt: '2026-10-01' },
  places: {
    IN: { taxRate: 20, housing: 25_000, living: 30_000 },
    AE: { housing: 5_000, living: 3_000 },
  },
})

describe('takeHome', () => {
  it('UAE: 0% tax by default, costs converted from AED, every assumption listed', () => {
    const th = takeHome({ grossMonthly: 400_000, currency: 'INR', place: 'AE', assumptions })
    expect(th.taxRate).toBe(0)
    expect(th.net).toBe(400_000)
    expect(th.housing).toBeCloseTo((5_000 / 3.6725) * 83, 6)
    expect(th.living).toBeCloseTo((3_000 / 3.6725) * 83, 6)
    expect(th.disposable).toBeCloseTo(400_000 - ((8_000 / 3.6725) * 83), 6)
    expect(th.assumptions[0]).toContain('no personal income tax')
    expect(th.assumptions.join(' ')).toContain('(your assumption)')
  })

  it('India: the user’s effective tax, housing and living costs', () => {
    const th = takeHome({ grossMonthly: 200_000, currency: 'INR', place: 'IN', assumptions })
    expect(th.net).toBe(160_000)
    expect(th.disposable).toBe(160_000 - 25_000 - 30_000)
  })

  it('housing provided by the employer counts as zero housing cost', () => {
    const th = takeHome({ grossMonthly: 400_000, currency: 'INR', place: 'AE', housingProvided: true, assumptions })
    expect(th.housing).toBe(0)
    expect(th.assumptions.join(' ')).toContain('Housing: provided')
  })

  it('unset tax leaves net unknown, never zero tax', () => {
    const none = assumptionsSchema.parse({})
    const th = takeHome({ grossMonthly: 200_000, currency: 'INR', place: 'IN', assumptions: none })
    expect(th.net).toBeNull()
    expect(th.disposable).toBeNull()
    expect(th.assumptions[0]).toContain('not set')
  })
})

describe('payRatio', () => {
  it('compares take-home after tax (never the leftover after costs), else gross', () => {
    const job = takeHome({ grossMonthly: 400_000, currency: 'INR', place: 'AE', assumptions })
    const cur = takeHome({ grossMonthly: 200_000, currency: 'INR', place: 'IN', assumptions })
    expect(payRatio(job, cur)).toEqual({ ratio: 400_000 / 160_000, basis: 'net' })

    const taxOnly = assumptionsSchema.parse({ places: { IN: { taxRate: 20 } } })
    const j2 = takeHome({ grossMonthly: 300_000, currency: 'INR', place: 'AE', assumptions: taxOnly })
    const c2 = takeHome({ grossMonthly: 200_000, currency: 'INR', place: 'IN', assumptions: taxOnly })
    expect(payRatio(j2, c2)).toEqual({ ratio: 300_000 / 160_000, basis: 'net' })

    const none = assumptionsSchema.parse({})
    const j3 = takeHome({ grossMonthly: 300_000, currency: 'INR', place: 'AE', assumptions: none })
    const c3 = takeHome({ grossMonthly: 200_000, currency: 'INR', place: 'IN', assumptions: none })
    expect(payRatio(j3, c3)).toEqual({ ratio: 1.5, basis: 'gross' })
  })
})
