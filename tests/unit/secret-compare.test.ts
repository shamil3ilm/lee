import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { isBearerAuthorized, secretsEqual } from '@/lib/auth/secret-compare'
import { isCronAuthorized } from '@/lib/queue/cron'
import { env } from '@/lib/env'

describe('secretsEqual', () => {
  it('matches equal strings only', () => {
    expect(secretsEqual('abc', 'abc')).toBe(true)
    expect(secretsEqual('abd', 'abc')).toBe(false)
    expect(secretsEqual('ab', 'abc')).toBe(false)
    expect(secretsEqual('abcd', 'abc')).toBe(false)
    expect(secretsEqual('', 'abc')).toBe(false)
  })

  it('never authorizes against an empty expected secret', () => {
    expect(secretsEqual('', '')).toBe(false)
    expect(isBearerAuthorized('Bearer ', '')).toBe(false)
  })
})

describe('isBearerAuthorized', () => {
  it('accepts the exact bearer header and rejects near misses', () => {
    expect(isBearerAuthorized('Bearer s3cret', 's3cret')).toBe(true)
    expect(isBearerAuthorized('bearer s3cret', 's3cret')).toBe(false)
    expect(isBearerAuthorized('Bearer s3cre', 's3cret')).toBe(false)
    expect(isBearerAuthorized('Bearer s3cretX', 's3cret')).toBe(false)
    expect(isBearerAuthorized(null, 's3cret')).toBe(false)
    expect(isBearerAuthorized(undefined, 's3cret')).toBe(false)
  })
})

describe('isCronAuthorized', () => {
  const req = (auth?: string) => new Request('http://localhost/api/cron/x', auth ? { headers: { authorization: auth } } : {})

  it('uses CRON_SECRET', () => {
    expect(isCronAuthorized(req(`Bearer ${env.CRON_SECRET}`))).toBe(true)
    // Same length, one character different.
    const wrong = `Bearer ${env.CRON_SECRET.slice(0, -1)}${env.CRON_SECRET.endsWith('y') ? 'z' : 'y'}`
    expect(isCronAuthorized(req(wrong))).toBe(false)
    expect(isCronAuthorized(req())).toBe(false)
  })
})

/** Every cron route goes through the shared constant-time check. */
describe('cron routes guard', () => {
  const root = path.resolve(__dirname, '../../app/api/cron')
  const routes = readdirSync(root)
    .map((d) => path.join(root, d, 'route.ts'))
    .filter((f) => {
      try {
        return statSync(f).isFile()
      } catch {
        return false
      }
    })

  it('finds the cron routes', () => {
    expect(routes.length).toBeGreaterThanOrEqual(5)
  })

  it.each(routes.map((f) => [path.basename(path.dirname(f)), f]))('%s calls isCronAuthorized and never compares the secret directly', (_name, file) => {
    const src = readFileSync(file, 'utf8')
    expect(src).toContain('isCronAuthorized(')
    expect(src).not.toMatch(/CRON_SECRET/)
    expect(src).not.toMatch(/[!=]==\s*`Bearer/)
  })
})
