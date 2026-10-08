import { describe, expect, it } from 'vitest'
import { DEFAULT_SOURCES, sourceIdentity } from '@/lib/defaults/catalog'
import { EXCLUDED_NATIONALS_ONLY, WATCH_EMPLOYERS, watchEmployer } from '@/lib/defaults/watch-employers'

const byKey = new Map(DEFAULT_SOURCES.map((d) => [d.key, d] as const))

describe('GCC employer watch list', () => {
  it('covers the employers the user named', () => {
    for (const key of ['emirates-group', 'etihad', 'dewa', 'sewa', 'adnoc', 'adnec', 'ooredoo', 'du', 'eand', 'aramco', 'koc']) {
      expect(watchEmployer(key), key).toBeDefined()
    }
  })

  it('has unique keys and a starter source for every employer', () => {
    const keys = WATCH_EMPLOYERS.map((e) => e.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const e of WATCH_EMPLOYERS) {
      const source = byKey.get(e.sourceKey)
      expect(source, e.key).toBeDefined()
      // An adapter employer is polled; every other employer is a watch link.
      expect(source!.kind === 'watch', e.key).toBe(!e.methods.includes('adapter'))
    }
  })

  it('offers an alert sign-up wherever "alert" is a method, and https links only', () => {
    for (const e of WATCH_EMPLOYERS) {
      expect(e.careersUrl).toMatch(/^https:\/\//)
      if (e.methods.includes('alert')) expect(e.alertSignupUrl, e.key).toMatch(/^https:\/\//)
    }
  })

  it('never ships a nationals-only portal', () => {
    const urls = new Set(DEFAULT_SOURCES.map((d) => String(d.config.url ?? '')))
    for (const x of EXCLUDED_NATIONALS_ONLY) expect(urls.has(x.url), x.name).toBe(false)
    expect(WATCH_EMPLOYERS.some((e) => e.nationalsOnly)).toBe(false)
  })

  it('v3 watch links carry the employer key and stay switched off', () => {
    const v3Watch = DEFAULT_SOURCES.filter((d) => d.since === 3 && d.kind === 'watch')
    expect(v3Watch.length).toBeGreaterThan(10)
    for (const d of v3Watch) {
      expect(d.enabled).toBe(false)
      expect(watchEmployer(String(d.config.employer))).toBeDefined()
    }
    const ids = DEFAULT_SOURCES.map((d) => sourceIdentity(d.kind, d.config))
    expect(new Set(ids).size).toBe(ids.length)
  })
})
