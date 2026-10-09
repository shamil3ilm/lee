import { createSign, generateKeyPairSync } from 'node:crypto'

/**
 * In-memory LinkedIn OIDC + Posts API as a `fetch` replacement
 * (www.linkedin.com and api.linkedin.com). Synthetic member only.
 *
 *   POST /oauth/v2/accessToken     code → access_token + RS256 id_token (nonce echoed)
 *   GET  /oauth/openid/jwks
 *   GET  /v2/userinfo
 *   POST /rest/posts               201 + x-restli-id
 */

export const LINKEDIN_APP = { clientId: 'synthetic-li-client', clientSecret: 'synthetic-li-secret-000000000000' }
export const MEMBER_SUB = 'aBcDeF123'

export interface FakeLinkedIn {
  fetch: typeof fetch
  env: Record<string, string>
  authorize(url: string): { code: string; state: string }
  issued: string[]
  posts: Array<{ body: Record<string, unknown>; headers: Record<string, string> }>
  state: { tamperNonce: boolean; postStatus: number; scopes: string }
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

export function fakeLinkedIn(): FakeLinkedIn {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }
  const codes = new Map<string, { nonce: string; scope: string; redirect: string }>()
  const valid = new Set<string>()
  let n = 0
  const li: FakeLinkedIn = {
    fetch: null as unknown as typeof fetch,
    env: { LINKEDIN_CLIENT_ID: LINKEDIN_APP.clientId, LINKEDIN_CLIENT_SECRET: LINKEDIN_APP.clientSecret },
    issued: [],
    posts: [],
    state: { tamperNonce: false, postStatus: 201, scopes: '' },
    authorize(url) {
      const u = new URL(url)
      n += 1
      const code = `li-code-${n}`
      codes.set(code, { nonce: u.searchParams.get('nonce') ?? '', scope: u.searchParams.get('scope') ?? '', redirect: u.searchParams.get('redirect_uri') ?? '' })
      return { code, state: u.searchParams.get('state') ?? '' }
    },
  }

  const idToken = (nonce: string): string => {
    const now = Math.floor(Date.now() / 1000)
    const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' })).toString('base64url')
    const p = Buffer.from(
      JSON.stringify({ iss: 'https://www.linkedin.com', aud: LINKEDIN_APP.clientId, sub: MEMBER_SUB, iat: now, exp: now + 3600, nonce, name: 'Asha Example', email: 'asha@example.com' }),
    ).toString('base64url')
    const s = createSign('RSA-SHA256').update(`${h}.${p}`).sign(privateKey).toString('base64url')
    return `${h}.${p}.${s}`
  }

  li.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const method = (init.method ?? 'GET').toUpperCase()
    const headers = Object.fromEntries(new Headers(init.headers).entries())
    if (url.hostname === 'www.linkedin.com' && url.pathname === '/oauth/v2/accessToken' && method === 'POST') {
      const form = Object.fromEntries(new URLSearchParams(String(init.body)))
      if (form.client_id !== LINKEDIN_APP.clientId || form.client_secret !== LINKEDIN_APP.clientSecret) return json(401, { error: 'invalid_client' })
      const c = codes.get(form.code ?? '')
      if (!c || c.redirect !== form.redirect_uri || form.grant_type !== 'authorization_code') return json(400, { error: 'invalid_request' })
      codes.delete(form.code!)
      n += 1
      const access = `AQV${'x'.repeat(20)}SYNTHETIC${n}${'y'.repeat(30)}`
      valid.add(access)
      li.issued.push(access)
      return json(200, {
        access_token: access,
        expires_in: 5183999,
        scope: li.state.scopes || c.scope.split(' ').join(','),
        token_type: 'Bearer',
        id_token: idToken(li.state.tamperNonce ? 'other-nonce' : c.nonce),
      })
    }
    if (url.hostname === 'www.linkedin.com' && url.pathname === '/oauth/openid/jwks') return json(200, { keys: [jwk] })
    if (url.hostname !== 'api.linkedin.com') return json(404, {})
    const token = headers.authorization?.replace(/^Bearer /, '') ?? ''
    if (!valid.has(token)) return json(401, { message: 'Invalid access token' })
    if (url.pathname === '/v2/userinfo') {
      return json(200, { sub: MEMBER_SUB, name: 'Asha Example', given_name: 'Asha', family_name: 'Example', picture: 'https://media.licdn.com/synthetic.jpg', email: 'asha@example.com', email_verified: true })
    }
    if (url.pathname === '/rest/posts' && method === 'POST') {
      li.posts.push({ body: JSON.parse(String(init.body)) as Record<string, unknown>, headers })
      if (li.state.postStatus !== 201) return json(li.state.postStatus, { message: 'refused' })
      return new Response(null, { status: 201, headers: { 'x-restli-id': `urn:li:share:7${String(li.posts.length).padStart(18, '0')}` } })
    }
    return json(404, {})
  }) as typeof fetch
  return li
}
