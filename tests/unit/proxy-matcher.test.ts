import { execFileSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'

// next-auth cannot load under vitest; the wrapper just hands back the handler.
vi.mock('@/lib/auth/edge', () => ({ edgeAuth: (handler: unknown) => handler }))

const { default: proxy, config } = await import('@/proxy')

// Compile the matcher exactly as `next build` does, using Next's own compiler.
// It runs in a child process: loading next/dist/build pulls in server
// internals that would leak into other files under vitest's isolate: false.
type CompiledMatcher = { regexp: string; missing?: unknown[] }
const compileScript = [
  "const { getMiddlewareMatchers } = require('next/dist/build/analysis/get-page-static-info')",
  'const input = JSON.parse(process.argv[1])',
  'process.stdout.write(JSON.stringify(getMiddlewareMatchers(input, {})))',
].join(';')
const [matcher] = JSON.parse(
  execFileSync(process.execPath, ['-e', compileScript, JSON.stringify(config.matcher)], { encoding: 'utf8' }),
) as CompiledMatcher[]
const re = new RegExp(matcher!.regexp)

describe('proxy matcher', () => {
  it.each([
    '/',
    '/analytics',
    '/applications/4f1c2a9e-0b7d-4f3e-9a51-2d6c8e7b1a00',
    '/cv-score',
    '/signin',
    '/settings/ai',
  ])('runs on page route %s', (path) => {
    expect(re.test(path)).toBe(true)
  })

  it.each([
    '/api/health',
    '/api/auth/session',
    '/api/cron/sync-all',
    '/api/applications',
    '/api',
    '/_next/static/chunks/main.js',
    '/_next/image',
    '/favicon.ico',
    '/robots.txt',
    '/analytics.rsc',
    '/analytics.segments/_tree.segment.rsc',
  ])('skips non-page request %s', (path) => {
    expect(re.test(path)).toBe(false)
  })

  it('skips router prefetches', () => {
    expect(matcher!.missing).toEqual(
      expect.arrayContaining([
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ]),
    )
  })
})

type Handler = (req: { auth: unknown; nextUrl: URL }) => Response | undefined
const handler = proxy as unknown as Handler

describe('proxy handler', () => {
  const at = (path: string) => new URL(path, 'http://localhost:3000')

  it('redirects a signed-out page load to /signin', () => {
    const res = handler({ auth: null, nextUrl: at('/analytics') })
    expect(res?.status).toBe(302)
    expect(res?.headers.get('location')).toBe('http://localhost:3000/signin')
  })

  it('lets a signed-in page load through', () => {
    expect(handler({ auth: { user: { id: 'u1' } }, nextUrl: at('/analytics') })).toBeUndefined()
  })

  it('never redirects /signin itself or /api', () => {
    expect(handler({ auth: null, nextUrl: at('/signin') })).toBeUndefined()
    expect(handler({ auth: null, nextUrl: at('/api/applications') })).toBeUndefined()
  })
})
