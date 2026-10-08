import { describe, expect, it } from 'vitest'
import { convertMoney, formatMoney, rateLine } from '@/lib/compare/fx'
import { fxTableSchema } from '@/lib/compare/types'

const table = (inr: number | null, updatedAt = '2026-10-01') =>
  fxTableSchema.parse({ rates: { INR: inr, EUR: null, GBP: null }, updatedAt })

describe('convertMoney', () => {
  it('converts AED to INR through the editable table (AED peg × INR per USD)', () => {
    const c = convertMoney(18_000, 'AED', 'INR', table(83))
    expect(c.amount).toBeCloseTo((18_000 / 3.6725) * 83, 6)
    expect(c.confidence).toBe('estimated')
    expect(c.source).toMatchObject({ kind: 'fx_table' })
    expect(c.source?.label).toContain('Oct 1')
  })

  it('converts INR back to AED with the same table', () => {
    const c = convertMoney(415_000, 'INR', 'AED', table(83))
    expect(c.amount).toBeCloseTo((415_000 / 83) * 3.6725, 6)
  })

  it('converts SAR and QAR through the pegs as known values, no table needed', () => {
    const sar = convertMoney(15_000, 'SAR', 'AED', table(null))
    expect(sar.amount).toBeCloseTo((15_000 / 3.75) * 3.6725, 6)
    expect(sar.confidence).toBe('known')
    expect(sar.source).toMatchObject({ kind: 'peg' })
    const qar = convertMoney(10_000, 'QAR', 'USD', table(null))
    expect(qar.amount).toBeCloseTo(10_000 / 3.64, 6)
  })

  it('marks the KWD basket as an estimate', () => {
    expect(convertMoney(1_000, 'KWD', 'AED', table(null)).confidence).toBe('estimated')
  })

  it('never guesses a floating rate: a missing INR rate leaves the amount unknown', () => {
    const c = convertMoney(18_000, 'AED', 'INR', table(null))
    expect(c.amount).toBeNull()
    expect(c.confidence).toBe('unknown')
    expect(c.missing).toBe('INR')
  })

  it('same currency is a no-op', () => {
    expect(convertMoney(5, 'INR', 'INR', table(null))).toMatchObject({ amount: 5, confidence: 'known', source: null })
  })

  it('formats a rate line and money with Indian grouping for INR', () => {
    expect(rateLine('AED', 'INR', table(83))).toBe('1 AED = 22.60 INR')
    expect(rateLine('AED', 'INR', table(null))).toBeNull()
    expect(formatMoney(185_000, 'INR')).toBe('INR 1,85,000')
    expect(formatMoney(18_000, 'AED')).toBe('AED 18,000')
  })
})
