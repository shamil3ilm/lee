import { describe, expect, it } from 'vitest'
import { plural } from '@/lib/ui/labels'

describe('plural', () => {
  it('uses the singular for exactly one', () => {
    expect(plural(1, 'item')).toBe('1 item')
  })
  it('adds "s" for zero and many', () => {
    expect(plural(0, 'source')).toBe('0 sources')
    expect(plural(3, 'file')).toBe('3 files')
  })
  it('takes an irregular plural', () => {
    expect(plural(2, 'entry', 'entries')).toBe('2 entries')
    expect(plural(1, 'entry', 'entries')).toBe('1 entry')
  })
})
