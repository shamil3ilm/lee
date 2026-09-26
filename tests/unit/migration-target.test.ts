import { describe, it, expect } from 'vitest'
import { resolveMigrationTarget } from '@/lib/db/migration-target'

const PROD_DIRECT = 'postgresql://u:p@ep-x.neon.tech/db'
const PROD_POOLED = 'postgresql://u:p@ep-x-pooler.neon.tech/db'

describe('resolveMigrationTarget', () => {
  it('prefers the direct (unpooled) URL for migrations', () => {
    const plan = resolveMigrationTarget({
      DATABASE_URL: PROD_POOLED,
      DATABASE_URL_UNPOOLED: PROD_DIRECT,
    })
    expect(plan).toEqual({ action: 'run', url: PROD_DIRECT })
  })

  it('falls back to DATABASE_URL when no unpooled URL is set', () => {
    const plan = resolveMigrationTarget({ DATABASE_URL: 'pglite:memory://' })
    expect(plan).toEqual({ action: 'run', url: 'pglite:memory://' })
  })

  it('runs on Vercel production', () => {
    const plan = resolveMigrationTarget({
      VERCEL: '1',
      VERCEL_ENV: 'production',
      DATABASE_URL_UNPOOLED: PROD_DIRECT,
    })
    expect(plan).toEqual({ action: 'run', url: PROD_DIRECT })
  })

  it('skips on Vercel preview even when a database URL is present', () => {
    const plan = resolveMigrationTarget({
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      DATABASE_URL_UNPOOLED: PROD_DIRECT,
    })
    expect(plan.action).toBe('skip')
  })

  it('skips on Vercel preview with no database configured instead of failing the build', () => {
    const plan = resolveMigrationTarget({ VERCEL: '1', VERCEL_ENV: 'preview' })
    expect(plan.action).toBe('skip')
  })

  it('throws off-Vercel when no database URL is configured', () => {
    expect(() => resolveMigrationTarget({})).toThrow(/DATABASE_URL/)
  })

  it('treats blank values as missing', () => {
    const plan = resolveMigrationTarget({ DATABASE_URL_UNPOOLED: '  ', DATABASE_URL: PROD_POOLED })
    expect(plan).toEqual({ action: 'run', url: PROD_POOLED })
  })
})
