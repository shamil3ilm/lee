import { createHash, createVerify, generateKeyPairSync } from 'node:crypto'
import type { FakeGitHub } from './fake-github'

/**
 * In-memory GitHub App + user-to-server OAuth, as a `fetch` replacement
 * (github.com web flow and api.github.com). Synthetic data only.
 *
 *   POST /login/oauth/access_token   code (+ PKCE verifier) or refresh_token grant
 *   DELETE /applications/:cid/grant  Basic client_id:client_secret
 *   GET  /user, /user/installations, /user/installations/:id/repositories,
 *        /users/:login/repos, /user/starred, /repos/:o/:r/languages|commits|contents/:p,
 *        /search/issues
 *   POST /app/installations/:id/access_tokens   RS256 app JWT (verified)
 * Everything else (the portfolio contents API) goes to `contents`, a
 * fakeGitHub that accepts the installation token or a fine-grained one.
 */

export const APP = {
  appId: '424242',
  clientId: 'Iv1.synthetic0000',
  clientSecret: 'synthetic-client-secret-0000000000000000',
  slug: 'lee-test-app',
}

export interface FakeGitHubApp {
  fetch: typeof fetch
  env: Record<string, string>
  /** Simulates the user approving on github.com: returns the callback code for an authorize URL. */
  authorize(url: string): { code: string; state: string }
  installationToken: string
  /** Every access token ever issued (to assert they are not stored in plaintext). */
  issued: string[]
  revoked: string[]
  tokenRequests: Array<Record<string, string>>
  installationTokenRequests: Array<{ repositories: string[]; permissions: Record<string, string> }>
  requests: Array<{ method: string; url: string }>
  state: {
    installed: boolean
    /** Refuse installation tokens for these repos (422), like a repo outside the installation. */
    refuseRepos: Set<string>
    starredForbidden: boolean
    accessTtl: number
    nextRefreshFails: boolean
  }
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

export function fakeGitHubApp(opts: { login?: string; contents?: FakeGitHub } = {}): FakeGitHubApp {
  const login = opts.login ?? 'example-asha'
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const codes = new Map<string, { challenge: string; method: string; redirect: string }>()
  const validAccess = new Set<string>()
  const validRefresh = new Set<string>()
  let n = 0
  const app: FakeGitHubApp = {
    fetch: null as unknown as typeof fetch,
    env: {
      GITHUB_APP_ID: APP.appId,
      GITHUB_APP_CLIENT_ID: APP.clientId,
      GITHUB_APP_CLIENT_SECRET: APP.clientSecret,
      GITHUB_APP_PRIVATE_KEY: pem.replace(/\n/g, '\\n'),
      GITHUB_APP_SLUG: APP.slug,
    },
    installationToken: 'ghs_SYNTHETICinstallation000000000000000000',
    issued: [],
    revoked: [],
    tokenRequests: [],
    installationTokenRequests: [],
    requests: [],
    state: { installed: true, refuseRepos: new Set(), starredForbidden: false, accessTtl: 28800, nextRefreshFails: false },
    authorize(url) {
      const u = new URL(url)
      if (u.searchParams.get('client_id') !== APP.clientId) throw new Error('wrong client_id')
      n += 1
      const code = `code-${n}`
      codes.set(code, {
        challenge: u.searchParams.get('code_challenge') ?? '',
        method: u.searchParams.get('code_challenge_method') ?? '',
        redirect: u.searchParams.get('redirect_uri') ?? '',
      })
      return { code, state: u.searchParams.get('state') ?? '' }
    },
  }

  const issue = (): Response => {
    n += 1
    const access = `ghu_SYNTHETICaccess${String(n).padStart(4, '0')}abcdefghijklmnopqrstuv`
    const refresh = `ghr_SYNTHETICrefresh${String(n).padStart(4, '0')}abcdefghijklmnopqrstuvwxyz0123456789abcdefghijk`
    validAccess.add(access)
    validRefresh.add(refresh)
    app.issued.push(access, refresh)
    return json(200, { access_token: access, expires_in: app.state.accessTtl, refresh_token: refresh, refresh_token_expires_in: 15897600, token_type: 'bearer', scope: '' })
  }

  const verifyJwt = (auth: string | null): boolean => {
    const token = auth?.replace(/^Bearer /, '') ?? ''
    const [h, p, s] = token.split('.')
    if (!h || !p || !s) return false
    const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, Buffer.from(s, 'base64url'))
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString()) as { iss?: string; exp?: number; iat?: number }
    return ok && claims.iss === APP.appId && typeof claims.exp === 'number' && claims.exp - (claims.iat ?? 0) <= 600
  }

  const repos = [
    { full_name: `${login}/portfolio`, private: false, html_url: `https://github.com/${login}/portfolio`, description: 'Personal site', topics: ['nextjs'], stargazers_count: 3, pushed_at: '2026-10-01T10:00:00Z', fork: false },
    { full_name: `${login}/payouts-engine`, private: true, html_url: `https://github.com/${login}/payouts-engine`, description: 'Idempotent payouts service', topics: ['payments', 'laravel', 'zatca'], stargazers_count: 0, pushed_at: '2026-09-20T10:00:00Z', fork: false },
  ]

  app.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const method = (init.method ?? 'GET').toUpperCase()
    const headers = new Headers(init.headers)
    const auth = headers.get('authorization')
    app.requests.push({ method, url: url.pathname + url.search })
    const path = url.pathname

    if (url.hostname === 'github.com' && path === '/login/oauth/access_token' && method === 'POST') {
      const form = Object.fromEntries(new URLSearchParams(String(init.body)))
      app.tokenRequests.push(form)
      if (form.client_id !== APP.clientId || form.client_secret !== APP.clientSecret) return json(401, { error: 'incorrect_client_credentials' })
      if (form.grant_type === 'refresh_token') {
        if (app.state.nextRefreshFails || !validRefresh.has(form.refresh_token ?? '')) {
          // Like a revoked authorization: this refresh token stays refused.
          app.state.nextRefreshFails = false
          validRefresh.delete(form.refresh_token ?? '')
          return json(200, { error: 'bad_refresh_token' })
        }
        validRefresh.delete(form.refresh_token!)
        return issue()
      }
      const c = codes.get(form.code ?? '')
      if (!c) return json(200, { error: 'bad_verification_code' })
      codes.delete(form.code!)
      const challenge = createHash('sha256').update(form.code_verifier ?? '').digest('base64url')
      if (c.method !== 'S256' || challenge !== c.challenge || form.redirect_uri !== c.redirect) return json(200, { error: 'bad_verification_code' })
      return issue()
    }
    if (url.hostname !== 'api.github.com') return json(404, { message: 'Not Found' })

    if (path === `/applications/${APP.clientId}/grant` && method === 'DELETE') {
      if (auth !== `Basic ${Buffer.from(`${APP.clientId}:${APP.clientSecret}`).toString('base64')}`) return json(401, { message: 'Requires authentication' })
      const body = JSON.parse(String(init.body)) as { access_token: string }
      app.revoked.push(body.access_token)
      validAccess.delete(body.access_token)
      return new Response(null, { status: 204 })
    }
    const installMatch = /^\/app\/installations\/(\d+)\/access_tokens$/.exec(path)
    if (installMatch && method === 'POST') {
      if (!verifyJwt(auth)) return json(401, { message: 'A JSON web token could not be decoded' })
      const body = JSON.parse(String(init.body)) as { repositories: string[]; permissions: Record<string, string> }
      app.installationTokenRequests.push(body)
      if (!app.state.installed || body.repositories.some((r) => app.state.refuseRepos.has(r))) return json(422, { message: 'There is at least one repository that does not exist or is not accessible to the parent installation.' })
      return json(201, { token: app.installationToken, expires_at: '2026-10-09T09:00:00Z' })
    }
    if (path.startsWith('/repos/') && path.includes('/contents/') && opts.contents && !path.endsWith('package.json') && !path.endsWith('composer.json')) {
      return opts.contents.fetch(input, init)
    }
    if (opts.contents && /^\/repos\/[^/]+\/[^/]+$/.test(path)) return opts.contents.fetch(input, init)

    const token = auth?.replace(/^Bearer /, '') ?? ''
    if (!validAccess.has(token)) return json(401, { message: 'Bad credentials' })
    if (path === '/user') return json(200, { id: 9001, login, name: 'Asha Example', avatar_url: 'https://avatars.githubusercontent.com/u/9001' })
    if (path === '/user/installations') {
      return json(200, {
        total_count: app.state.installed ? 1 : 0,
        installations: app.state.installed
          ? [{ id: 777, app_id: Number(APP.appId), app_slug: APP.slug, account: { login }, repository_selection: 'selected', permissions: { contents: 'write', metadata: 'read' } }]
          : [],
      })
    }
    if (path === '/user/installations/777/repositories') return json(200, { total_count: repos.length, repositories: repos })
    if (path === `/users/${login}/repos`) return json(200, repos.filter((r) => !r.private))
    if (path === '/user/starred') {
      if (app.state.starredForbidden) return json(403, { message: 'Resource not accessible by integration' })
      return json(200, [{ full_name: 'vercel/next.js' }, { full_name: 'honojs/hono' }])
    }
    const repoMatch = /^\/repos\/([^/]+\/[^/]+)\/(languages|commits|contents\/(.+))$/.exec(path)
    if (repoMatch) {
      const full = repoMatch[1]!
      if (!repos.some((r) => r.full_name === full)) return json(404, { message: 'Not Found' })
      if (repoMatch[2] === 'languages') return json(200, full.endsWith('payouts-engine') ? { PHP: 9000, Blade: 1000 } : { TypeScript: 5000, CSS: 500 })
      if (repoMatch[2] === 'commits') {
        const total = full.endsWith('payouts-engine') ? 42 : 7
        return json(200, [{ commit: { author: { date: '2026-09-19T08:00:00Z' } } }], {
          link: `<https://api.github.com/repositories/1/commits?author=${login}&per_page=1&page=2>; rel="next", <https://api.github.com/repositories/1/commits?author=${login}&per_page=1&page=${total}>; rel="last"`,
        })
      }
      const file = repoMatch[3]
      if (file === 'composer.json' && full.endsWith('payouts-engine')) {
        const text = JSON.stringify({ require: { php: '^8.3', 'laravel/framework': '^12.0' } })
        return json(200, { type: 'file', size: text.length, content: Buffer.from(text).toString('base64') })
      }
      return json(404, { message: 'Not Found' })
    }
    if (path === '/search/issues') {
      const q = url.searchParams.get('q') ?? ''
      return json(200, { total_count: q.includes('payouts-engine') ? 5 : 1, items: [] })
    }
    return json(404, { message: 'Not Found' })
  }) as typeof fetch
  return app
}
