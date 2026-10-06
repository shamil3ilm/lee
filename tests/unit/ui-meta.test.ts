import { describe, expect, it } from 'vitest'
import { joinMeta, metaParts } from '@/lib/ui/meta'
import { workModeLabel } from '@/lib/ui/labels'

describe('metaParts / joinMeta', () => {
  it('keeps only present parts, so no leading or doubled separators', () => {
    expect(joinMeta(['Juspay', 'Bengaluru, IN'])).toBe('Juspay · Bengaluru, IN')
    expect(joinMeta([null, 'Bengaluru, IN'])).toBe('Bengaluru, IN')
    expect(joinMeta(['', '  ', undefined, false])).toBe('')
  })

  it('drops placeholder values such as "—"', () => {
    expect(joinMeta(['—', 'checked 5h ago'])).toBe('checked 5h ago')
    expect(metaParts(['unknown', 'n/a', '-', 'Remote'])).toEqual(['Remote'])
  })

  it('trims and de-duplicates', () => {
    expect(metaParts([' Remote ', 'Remote', 'Dubai'])).toEqual(['Remote', 'Dubai'])
  })
})

describe('workModeLabel', () => {
  it('capitalises work modes', () => {
    expect(workModeLabel('remote')).toBe('Remote')
    expect(workModeLabel('hybrid')).toBe('Hybrid')
    expect(workModeLabel('onsite')).toBe('On-site')
    expect(workModeLabel('ON-SITE')).toBe('On-site')
  })

  it('returns null for unknown or empty values', () => {
    expect(workModeLabel('unknown')).toBeNull()
    expect(workModeLabel('')).toBeNull()
    expect(workModeLabel(null)).toBeNull()
  })
})
