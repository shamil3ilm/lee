import { describe, expect, it } from 'vitest'
import { edgeAuthConfig } from '@/lib/auth/edge-config'
import { DRIVE_FILE_SCOPE, hasDriveScope } from '@/lib/drive/scope'
import { documentFolderName } from '@/lib/drive/folders'
import { qLiteral } from '@/lib/drive/client'

describe('drive.file scope', () => {
  it('is requested on the Google provider with incremental authorization', () => {
    const google = edgeAuthConfig.providers[0] as unknown as {
      options?: { authorization?: { params?: Record<string, string> } }
    }
    const params = google.options?.authorization?.params ?? {}
    expect(params.scope?.split(' ')).toContain(DRIVE_FILE_SCOPE)
    expect(params.scope?.split(' ')).toContain('https://www.googleapis.com/auth/gmail.readonly')
    expect(params.include_granted_scopes).toBe('true')
    expect(params.access_type).toBe('offline')
  })

  it('detects the scope in a stored account scope string', () => {
    expect(hasDriveScope(`openid email ${DRIVE_FILE_SCOPE}`)).toBe(true)
    expect(hasDriveScope('openid email https://www.googleapis.com/auth/drive.readonly')).toBe(false)
    expect(hasDriveScope(null)).toBe(false)
  })
})

describe('drive helpers', () => {
  it('names document folders "<title>-<id8>" safely', () => {
    const id = '12345678-aaaa-bbbb-cccc-1234567890ab'
    expect(documentFolderName('Backend / Platform CV', id)).toBe('Backend Platform CV-12345678')
    expect(documentFolderName('   ', id)).toBe('Document-12345678')
  })

  it('escapes quotes in Drive query literals', () => {
    expect(qLiteral("O'Brien \\ CV")).toBe("'O\\'Brien \\\\ CV'")
  })
})
