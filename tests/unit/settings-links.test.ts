import { describe, expect, it } from 'vitest'
import { safeReturnPath, searchPrefsHref, settingsHref, withReturn } from '@/lib/ui/settings-links'

describe('settings links that come back', () => {
  it('adds the return path and the anchor', () => {
    expect(searchPrefsHref()).toBe('/settings/search')
    expect(searchPrefsHref('/discoveries')).toBe('/settings/search?from=%2Fdiscoveries')
    expect(settingsHref('/settings/profile', '/', 'cv-import')).toBe('/settings/profile?from=%2F#cv-import')
    expect(settingsHref('/settings/sources', undefined, 'email-alerts')).toBe('/settings/sources#email-alerts')
  })

  it('accepts only internal paths as a return target', () => {
    expect(safeReturnPath('/shortlist')).toBe('/shortlist')
    expect(safeReturnPath('/discoveries?view=board')).toBe('/discoveries?view=board')
    expect(safeReturnPath('//evil.example')).toBeNull()
    expect(safeReturnPath('/\\evil.example')).toBeNull()
    expect(safeReturnPath('https://evil.example')).toBeNull()
    expect(safeReturnPath(undefined)).toBeNull()
    expect(safeReturnPath('/\t/evil.example')).toBeNull()
    expect(safeReturnPath('/\n/evil.example')).toBeNull()
    expect(settingsHref('/settings/search', 'https://evil.example')).toBe('/settings/search')
  })

  it('adds the return path to Settings links only', () => {
    expect(withReturn('/settings/sources#email-alerts', '/')).toBe('/settings/sources?from=%2F#email-alerts')
    expect(withReturn('/settings/search', '/')).toBe('/settings/search?from=%2F')
    expect(withReturn('/cv-score', '/')).toBe('/cv-score')
    expect(withReturn('/settings/search?x=1', '/')).toBe('/settings/search?x=1')
  })
})
