import { describe, expect, it } from 'vitest'
import { e2eAiFixturesEnabled } from '@/lib/ai'

describe('E2E fixture AI guard', () => {
  it('needs the local test sign-in and the flag', () => {
    expect(e2eAiFixturesEnabled({ NODE_ENV: 'development', E2E_TEST_LOGIN: '1', E2E_AI_FIXTURES: '1' })).toBe(true)
    expect(e2eAiFixturesEnabled({ NODE_ENV: 'development', E2E_TEST_LOGIN: '1' })).toBe(false)
    expect(e2eAiFixturesEnabled({ NODE_ENV: 'development', E2E_AI_FIXTURES: '1' })).toBe(false)
  })

  it('is never on in production or on Vercel', () => {
    expect(e2eAiFixturesEnabled({ NODE_ENV: 'production', E2E_TEST_LOGIN: '1', E2E_AI_FIXTURES: '1' })).toBe(false)
    expect(e2eAiFixturesEnabled({ NODE_ENV: 'development', VERCEL: '1', E2E_TEST_LOGIN: '1', E2E_AI_FIXTURES: '1' })).toBe(false)
  })
})
