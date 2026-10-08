import { describe, expect, it } from 'vitest'
import { currencyOptions } from '@/lib/ui/currencies'

describe('currencyOptions', () => {
  it('labels common currencies by name', () => {
    const inr = currencyOptions().find((c) => c.code === 'INR')
    expect(inr?.label).toMatch(/^INR · /)
  })

  it('keeps an uncommon saved code selectable', () => {
    expect(currencyOptions('nok')[0]?.code).toBe('NOK')
    expect(currencyOptions('bogus').some((c) => c.code === 'BOGUS')).toBe(false)
  })
})
