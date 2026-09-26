import { describe, it, expect } from 'vitest'
import {
  DEFAULT_CURRENCY,
  localeForCurrency,
  normalizeCurrency,
} from '@/lib/money/currency'
import { formatMoney, formatMoneyAxis, formatMoneyCompact } from '@/lib/ui/money'

describe('currency defaults', () => {
  it('defaults to INR', () => {
    expect(DEFAULT_CURRENCY).toBe('INR')
  })

  it('normalizes empty/whitespace to the default and uppercases codes', () => {
    expect(normalizeCurrency(undefined)).toBe('INR')
    expect(normalizeCurrency('   ')).toBe('INR')
    expect(normalizeCurrency('usd')).toBe('USD')
  })

  it('maps INR to Indian grouping locale and unknown codes to en-US', () => {
    expect(localeForCurrency('INR')).toBe('en-IN')
    expect(localeForCurrency('inr')).toBe('en-IN')
    expect(localeForCurrency('XYZ')).toBe('en-US')
  })
})

describe('formatMoney', () => {
  it('uses INR with Indian digit grouping by default', () => {
    expect(formatMoney(123456700)).toBe('INR 12,34,567.00')
  })

  it('keeps western grouping for other currencies', () => {
    expect(formatMoney(123456700, 'USD')).toBe('USD 1,234,567.00')
  })

  it('handles negatives and small amounts', () => {
    expect(formatMoney(-5050)).toBe('-INR 50.50')
    expect(formatMoney(0)).toBe('INR 0.00')
  })

  it('compact format follows currency grouping', () => {
    expect(formatMoneyCompact(123456700)).toBe('12,34,567')
    expect(formatMoneyCompact(123456700, 'USD')).toBe('1,234,567')
  })
})

describe('formatMoneyAxis', () => {
  it('uses compact notation so axis ticks fit a 40px gutter', () => {
    expect(formatMoneyAxis(4_000_000)).toBe('40K')
    expect(formatMoneyAxis(12_500_000)).toBe('1.3L')
    expect(formatMoneyAxis(250_000_000, 'USD')).toBe('2.5M')
    expect(formatMoneyAxis(0)).toBe('0')
  })
})
