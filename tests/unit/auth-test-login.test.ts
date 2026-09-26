import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertTestLoginNotInProduction,
  isTestLoginEnabled,
} from '@/lib/auth/test-login-guard'
import { isTestLoginSignIn, loadTestLogin } from '@/lib/auth/test-login-provider'
import { TEST_LOGIN_EMAIL, TEST_LOGIN_PROVIDER_ID } from '@/lib/auth/test-login'

// v17 §9.1 — the local E2E test sign-in must be impossible to enable in
// production. Each gate is proven independently.

const DEV_ON = { NODE_ENV: 'development', E2E_TEST_LOGIN: '1' } as const

// Auth.js provider factories return `{ id: <default>, options: <user config> }`
// and merge the options at runtime, so the effective id is options.id.
function effectiveId(p: unknown): string {
  const prov = p as { id: string; options?: { id?: string } }
  return prov.options?.id ?? prov.id
}

describe('isTestLoginEnabled', () => {
  it('is enabled only in non-production with E2E_TEST_LOGIN=1 and no VERCEL', () => {
    expect(isTestLoginEnabled(DEV_ON)).toBe(true)
    expect(isTestLoginEnabled({ NODE_ENV: 'test', E2E_TEST_LOGIN: '1' })).toBe(true)
  })

  it('is disabled when NODE_ENV=production', () => {
    expect(isTestLoginEnabled({ ...DEV_ON, NODE_ENV: 'production' })).toBe(false)
  })

  it('is disabled when VERCEL is set (any value)', () => {
    expect(isTestLoginEnabled({ ...DEV_ON, VERCEL: '1' })).toBe(false)
    expect(isTestLoginEnabled({ ...DEV_ON, VERCEL: 'true' })).toBe(false)
  })

  it('is disabled when the flag is missing or not exactly "1"', () => {
    expect(isTestLoginEnabled({ NODE_ENV: 'development' })).toBe(false)
    for (const v of ['', '0', 'true', 'yes', ' 1']) {
      expect(isTestLoginEnabled({ NODE_ENV: 'development', E2E_TEST_LOGIN: v })).toBe(false)
    }
  })
})

describe('assertTestLoginNotInProduction', () => {
  it('throws when the flag is set with NODE_ENV=production', () => {
    expect(() =>
      assertTestLoginNotInProduction({ NODE_ENV: 'production', E2E_TEST_LOGIN: '1' }),
    ).toThrow(/E2E_TEST_LOGIN is set while NODE_ENV=production/)
  })

  it('throws when the flag is set with VERCEL set, even outside production', () => {
    expect(() =>
      assertTestLoginNotInProduction({ NODE_ENV: 'development', VERCEL: '1', E2E_TEST_LOGIN: '1' }),
    ).toThrow(/VERCEL is set/)
  })

  it('throws for any non-empty flag value in production, not just "1"', () => {
    expect(() =>
      assertTestLoginNotInProduction({ NODE_ENV: 'production', E2E_TEST_LOGIN: '0' }),
    ).toThrow()
  })

  it('does not throw for normal production or local test runs', () => {
    expect(() => assertTestLoginNotInProduction({ NODE_ENV: 'production' })).not.toThrow()
    expect(() => assertTestLoginNotInProduction({ VERCEL: '1' })).not.toThrow()
    expect(() => assertTestLoginNotInProduction(DEV_ON)).not.toThrow()
  })
})

describe('loadTestLogin', () => {
  it('returns the fixed-identity provider when enabled', () => {
    const tl = loadTestLogin(DEV_ON)
    expect(effectiveId(tl?.provider)).toBe(TEST_LOGIN_PROVIDER_ID)
    expect(tl?.provider.type).toBe('credentials')
  })

  it('returns null when the flag is unset', () => {
    expect(loadTestLogin({ NODE_ENV: 'development' })).toBeNull()
  })

  it('throws (never loads) in production or on Vercel with the flag set', () => {
    expect(() => loadTestLogin({ NODE_ENV: 'production', E2E_TEST_LOGIN: '1' })).toThrow()
    expect(() => loadTestLogin({ ...DEV_ON, VERCEL: '1' })).toThrow()
  })
})

describe('isTestLoginSignIn', () => {
  const account = { provider: TEST_LOGIN_PROVIDER_ID }

  it('admits only the fixed identity through the test provider', () => {
    expect(isTestLoginSignIn({ user: { email: TEST_LOGIN_EMAIL }, account }, DEV_ON)).toBe(true)
  })

  it('rejects any other email, even through the test provider', () => {
    expect(isTestLoginSignIn({ user: { email: 'owner@example.com' }, account }, DEV_ON)).toBe(false)
  })

  it('never short-circuits a Google sign-in', () => {
    expect(
      isTestLoginSignIn({ user: { email: TEST_LOGIN_EMAIL }, account: { provider: 'google' } }, DEV_ON),
    ).toBe(false)
  })

  it('rejects when disabled by NODE_ENV, VERCEL or a missing flag', () => {
    const user = { email: TEST_LOGIN_EMAIL }
    expect(isTestLoginSignIn({ user, account }, { ...DEV_ON, NODE_ENV: 'production' })).toBe(false)
    expect(isTestLoginSignIn({ user, account }, { ...DEV_ON, VERCEL: '1' })).toBe(false)
    expect(isTestLoginSignIn({ user, account }, { NODE_ENV: 'development' })).toBe(false)
  })
})

describe('auth config wiring', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  async function providerIds(): Promise<string[]> {
    vi.resetModules()
    const { authConfig } = await import('@/lib/auth/config')
    return authConfig.providers.map(effectiveId)
  }

  it('registers only Google when the flag is unset', async () => {
    vi.stubEnv('E2E_TEST_LOGIN', '')
    expect(await providerIds()).toEqual(['google'])
  })

  it('registers only Google when VERCEL is set and the flag is unset', async () => {
    vi.stubEnv('E2E_TEST_LOGIN', '')
    vi.stubEnv('VERCEL', '1')
    expect(await providerIds()).toEqual(['google'])
  })

  it('appends the test provider when enabled', async () => {
    vi.stubEnv('E2E_TEST_LOGIN', '1')
    vi.stubEnv('VERCEL', '')
    expect(await providerIds()).toEqual(['google', TEST_LOGIN_PROVIDER_ID])
  })

  it('refuses to load the auth config with the flag set on Vercel', async () => {
    vi.stubEnv('E2E_TEST_LOGIN', '1')
    vi.stubEnv('VERCEL', '1')
    vi.resetModules()
    await expect(import('@/lib/auth/config')).rejects.toThrow(/VERCEL is set/)
  })
})

describe('next.config startup guard', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('throws when next.config loads with the flag and NODE_ENV=production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('E2E_TEST_LOGIN', '1')
    vi.resetModules()
    await expect(import('@/next.config')).rejects.toThrow(/NODE_ENV=production/)
  })

  it('throws when next.config loads with the flag and VERCEL set', async () => {
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('E2E_TEST_LOGIN', '1')
    vi.resetModules()
    await expect(import('@/next.config')).rejects.toThrow(/VERCEL is set/)
  })

  it('loads normally for a production build without the flag', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('E2E_TEST_LOGIN', '')
    vi.resetModules()
    await expect(import('@/next.config')).resolves.toBeDefined()
  })
})
