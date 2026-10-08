import { describe, expect, it } from 'vitest'
import { safeReturnPath } from '@/lib/ui/return-path'

describe('safeReturnPath', () => {
  it('keeps internal paths', () => {
    expect(safeReturnPath('/')).toBe('/')
    expect(safeReturnPath('/discoveries?tab=jobs')).toBe('/discoveries?tab=jobs')
    expect(safeReturnPath(['/shortlist', '/x'])).toBe('/shortlist')
  })

  it('rejects external and tricky values', () => {
    for (const v of ['https://evil.test', '//evil.test', '/\\evil.test', 'evil', '', '/a\nb', undefined, null]) {
      expect(safeReturnPath(v)).toBeNull()
    }
  })
})
