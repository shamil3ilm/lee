import { describe, expect, it } from 'vitest'
import { authorizeTestUser } from '@/lib/auth/test-login-provider'
import { TEST_LOGIN_EMAIL } from '@/lib/auth/test-login'
import { makeUser } from '@/tests/factories'

// v17 §9.1 — authorize() only ever resolves the seeded fixed identity.
const DEV_ON = { NODE_ENV: 'development', E2E_TEST_LOGIN: '1' }

describe('authorizeTestUser', () => {
  it('returns the seeded test user when enabled', async () => {
    const u = await makeUser(TEST_LOGIN_EMAIL)
    await makeUser('owner@example.com')
    const res = await authorizeTestUser(DEV_ON)
    expect(res).toMatchObject({ id: u.id, email: TEST_LOGIN_EMAIL })
  })

  it('returns null when the test user is not seeded (never creates it)', async () => {
    await makeUser('owner@example.com')
    expect(await authorizeTestUser(DEV_ON)).toBeNull()
  })

  it('returns null when disabled, even if the test user exists', async () => {
    await makeUser(TEST_LOGIN_EMAIL)
    expect(await authorizeTestUser({ ...DEV_ON, NODE_ENV: 'production' })).toBeNull()
    expect(await authorizeTestUser({ ...DEV_ON, VERCEL: '1' })).toBeNull()
    expect(await authorizeTestUser({ NODE_ENV: 'development' })).toBeNull()
  })
})
