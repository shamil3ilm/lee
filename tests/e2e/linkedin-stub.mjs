// E2E only: a stand-in for LinkedIn (OIDC sign-in + the Posts API), so
// Connect LinkedIn and the post composer run end to end offline. The e2e
// dev server points lee at it with LINKEDIN_WEB_URL / LINKEDIN_API_URL
// (tests/e2e/env.ts). Synthetic member only.
//
//   GET  /health
//   GET  /oauth/v2/authorization   → 302 back to redirect_uri with code + state
//   POST /oauth/v2/accessToken     → access token + RS256 id_token (nonce echoed)
//   GET  /oauth/openid/jwks
//   GET  /v2/userinfo
//   POST /rest/posts               → 201 + x-restli-id
//   GET  /__test/posts             → { posts: [{ body, version }] }
import { createServer } from 'node:http'
import { createSign, generateKeyPairSync, randomBytes } from 'node:crypto'

const PORT = Number(process.env.LINKEDIN_STUB_PORT ?? 3197)
const BASE = `http://localhost:${PORT}`
const SUB = 'e2eMember01'
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const JWK = { ...publicKey.export({ format: 'jwk' }), kid: 'e2e', alg: 'RS256', use: 'sig' }
const codes = new Map()
const tokens = new Set()
const posts = []

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data))
  })
}

function idToken(clientId, nonce) {
  const now = Math.floor(Date.now() / 1000)
  const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'e2e', typ: 'JWT' })).toString('base64url')
  const p = Buffer.from(JSON.stringify({ iss: BASE, aud: clientId, sub: SUB, iat: now, exp: now + 3600, nonce, name: 'Asha Example' })).toString('base64url')
  return `${h}.${p}.${createSign('RSA-SHA256').update(`${h}.${p}`).sign(privateKey).toString('base64url')}`
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', BASE)
  if (url.pathname === '/health') return send(res, 200, { ok: true })
  if (url.pathname === '/__test/posts') return send(res, 200, { posts })
  if (url.pathname === '/oauth/v2/authorization') {
    const code = `li-e2e-${randomBytes(6).toString('hex')}`
    codes.set(code, { nonce: url.searchParams.get('nonce') ?? '', scope: url.searchParams.get('scope') ?? '', clientId: url.searchParams.get('client_id') ?? '' })
    const back = new URL(url.searchParams.get('redirect_uri'))
    back.searchParams.set('code', code)
    back.searchParams.set('state', url.searchParams.get('state') ?? '')
    res.writeHead(302, { location: back.toString() })
    return res.end()
  }
  if (url.pathname === '/oauth/v2/accessToken' && req.method === 'POST') {
    const form = Object.fromEntries(new URLSearchParams(await readBody(req)))
    const c = codes.get(form.code)
    codes.delete(form.code)
    if (!c || c.clientId !== form.client_id) return send(res, 400, { error: 'invalid_request' })
    const access = `AQVe2e${randomBytes(24).toString('hex')}`
    tokens.add(access)
    return send(res, 200, { access_token: access, expires_in: 5183999, scope: c.scope.split(' ').join(','), token_type: 'Bearer', id_token: idToken(c.clientId, c.nonce) })
  }
  if (url.pathname === '/oauth/openid/jwks') return send(res, 200, { keys: [JWK] })
  const auth = (req.headers.authorization ?? '').replace(/^Bearer /, '')
  if (!tokens.has(auth)) return send(res, 401, { message: 'Invalid access token' })
  if (url.pathname === '/v2/userinfo') return send(res, 200, { sub: SUB, name: 'Asha Example', given_name: 'Asha', family_name: 'Example', email: 'asha@example.com', email_verified: true })
  if (url.pathname === '/rest/posts' && req.method === 'POST') {
    posts.push({ body: JSON.parse(await readBody(req)), version: req.headers['linkedin-version'] ?? null })
    return send(res, 201, {}, { 'x-restli-id': `urn:li:share:7${String(posts.length).padStart(18, '0')}` })
  }
  send(res, 404, { message: 'Not Found' })
}).listen(PORT, () => {
  process.stdout.write(`linkedin stub on ${PORT}\n`)
})
