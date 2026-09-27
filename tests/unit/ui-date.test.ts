import { describe, expect, it } from 'vitest'
import { relativeFromNow, shortDay } from '@/lib/ui/date'

describe('shortDay', () => {
  it('formats a stored calendar day in the US short style', () => {
    expect(shortDay('2026-09-21')).toBe('Sep 21')
    expect(shortDay('2026-01-01')).toBe('Jan 1')
  })

  it('returns anything that is not a YYYY-MM-DD day unchanged', () => {
    expect(shortDay('21/09/2026')).toBe('21/09/2026')
    expect(shortDay('')).toBe('')
  })
})

describe('relativeFromNow', () => {
  it('says "just now" instead of "0m ago"', () => {
    expect(relativeFromNow(new Date())).toBe('just now')
  })

  it('keeps minute and day granularity', () => {
    expect(relativeFromNow(new Date(Date.now() - 5 * 60_000))).toBe('5m ago')
    expect(relativeFromNow(new Date(Date.now() + 2 * 86_400_000))).toBe('in 2d')
  })
})
