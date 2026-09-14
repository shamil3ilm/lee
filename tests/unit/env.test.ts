import { describe, it, expect } from 'vitest'
import { parseEnv } from '@/lib/env/schema'

describe('env schema', () => {
  it('accepts a fully valid env', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgres://u:p@h:5432/d',
      AUTH_SECRET: 'x'.repeat(32),
      AUTH_GOOGLE_ID: 'gid',
      AUTH_GOOGLE_SECRET: 'gsec',
      NEXTAUTH_URL: 'https://example.com',
      ALLOWED_EMAIL: 'a@b.com',
      AI_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'k',
      CRON_SECRET: 'x'.repeat(32),
    })
    expect(env.AI_PROVIDER).toBe('gemini')
  })

  it('rejects gemini provider without GEMINI_API_KEY', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgres://u:p@h:5432/d',
        AUTH_SECRET: 'x'.repeat(32),
        AUTH_GOOGLE_ID: 'gid',
        AUTH_GOOGLE_SECRET: 'gsec',
        NEXTAUTH_URL: 'https://example.com',
        ALLOWED_EMAIL: 'a@b.com',
        AI_PROVIDER: 'gemini',
        CRON_SECRET: 'x'.repeat(32),
      }),
    ).toThrow(/GEMINI_API_KEY/)
  })

  it('accepts a pglite: DATABASE_URL', () => {
    const env = parseEnv({
      DATABASE_URL: 'pglite:memory://',
      AUTH_SECRET: 'x'.repeat(32),
      AUTH_GOOGLE_ID: 'gid',
      AUTH_GOOGLE_SECRET: 'gsec',
      NEXTAUTH_URL: 'https://example.com',
      ALLOWED_EMAIL: 'a@b.com',
      AI_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'k',
      CRON_SECRET: 'x'.repeat(32),
    })
    expect(env.DATABASE_URL).toBe('pglite:memory://')
  })

  it('rejects an invalid DATABASE_URL scheme', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'mysql://u:p@h/d',
        AUTH_SECRET: 'x'.repeat(32),
        AUTH_GOOGLE_ID: 'gid',
        AUTH_GOOGLE_SECRET: 'gsec',
        NEXTAUTH_URL: 'https://example.com',
        ALLOWED_EMAIL: 'a@b.com',
        AI_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'k',
        CRON_SECRET: 'x'.repeat(32),
      }),
    ).toThrow()
  })

  it('rejects a non-email ALLOWED_EMAIL', () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgres://u:p@h:5432/d',
        AUTH_SECRET: 'x'.repeat(32),
        AUTH_GOOGLE_ID: 'gid',
        AUTH_GOOGLE_SECRET: 'gsec',
        NEXTAUTH_URL: 'https://example.com',
        ALLOWED_EMAIL: 'not-an-email',
        AI_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'k',
        CRON_SECRET: 'x'.repeat(32),
      }),
    ).toThrow()
  })
})
