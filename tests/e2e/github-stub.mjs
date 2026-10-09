// E2E only: a stand-in for the GitHub contents API, so Publish runs end to
// end without the network or a real token. The e2e dev server points lee
// at it with GITHUB_API_URL (tests/e2e/env.ts). One in-memory repo with any
// number of files (profile.json, variants/<slug>.json…); any token starting
// with "github_pat_" is accepted.
//
//   GET    /health                          → 200
//   GET    /repos/:owner/:repo              → repo metadata
//   GET    /repos/:owner/:repo/contents/:p  → the file (404 until created)
//   PUT    /repos/:owner/:repo/contents/:p  → create / update with sha check
//   DELETE /repos/:owner/:repo/contents/:p  → delete with sha check
//   POST   /__test/edit?path=p              → replace a file (a "hand edit"); default profile.json
//   GET    /__test/file?path=p              → { text, sha, commits }; default profile.json
//
// Connect GitHub (GitHub App user authorization), via GITHUB_WEB_URL too:
//   GET    /login/oauth/authorize           → 302 back to redirect_uri with code + state
//   POST   /login/oauth/access_token        → ghu_ / ghr_ tokens (checks the PKCE verifier)
//   DELETE /applications/:client_id/grant   → 204 (revoke)
//   GET    /user, /user/installations, /user/installations/1/repositories,
//          /users/:login/repos, /user/starred, /repos/:o/:r/languages|commits, /search/issues
//   POST   /app/installations/1/access_tokens → a ghs_ installation token
// Contents calls accept a github_pat_ or a ghs_ token.
import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'

const PORT = Number(process.env.GITHUB_STUB_PORT ?? 3199)
const files = new Map()
let commits = 0
const LOGIN = 'example-asha'
const codes = new Map()
const userTokens = new Set()
const REPOS = [
  { full_name: `${LOGIN}/portfolio`, private: false, html_url: `https://github.com/${LOGIN}/portfolio`, description: 'Personal site', topics: ['nextjs'], stargazers_count: 2, pushed_at: '2026-10-01T10:00:00Z', fork: false },
  { full_name: `${LOGIN}/payouts-engine`, private: true, html_url: `https://github.com/${LOGIN}/payouts-engine`, description: 'Idempotent payouts service', topics: ['payments', 'laravel'], stargazers_count: 0, pushed_at: '2026-09-20T10:00:00Z', fork: false },
]

const sha = (t) => createHash('sha1').update(`blob ${Buffer.byteLength(t)}\0${t}`).digest('hex')

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data))
  })
}

function commit(owner, repo) {
  commits += 1
  const commitSha = createHash('sha1').update(`commit ${commits}`).digest('hex')
  return { sha: commitSha, html_url: `https://github.com/${owner}/${repo}/commit/${commitSha}` }
}

function issue() {
  const access = `ghu_e2e${randomBytes(12).toString('hex')}`
  userTokens.add(access)
  return { access_token: access, expires_in: 28800, refresh_token: `ghr_e2e${randomBytes(20).toString('hex')}`, refresh_token_expires_in: 15897600, token_type: 'bearer', scope: '' }
}

/** Connect GitHub routes; true when handled. */
async function appRoute(req, res, url) {
  const path = url.pathname
  if (path === '/login/oauth/authorize') {
    const code = `e2e-code-${randomBytes(6).toString('hex')}`
    codes.set(code, url.searchParams.get('code_challenge'))
    const back = new URL(url.searchParams.get('redirect_uri'))
    back.searchParams.set('code', code)
    back.searchParams.set('state', url.searchParams.get('state') ?? '')
    res.writeHead(302, { location: back.toString() })
    res.end()
    return true
  }
  if (path === '/login/oauth/access_token' && req.method === 'POST') {
    const form = Object.fromEntries(new URLSearchParams(await readBody(req)))
    if (form.grant_type === 'refresh_token') return send(res, 200, issue()), true
    const challenge = codes.get(form.code)
    codes.delete(form.code)
    const ok = challenge && createHash('sha256').update(form.code_verifier ?? '').digest('base64url') === challenge
    send(res, 200, ok ? issue() : { error: 'bad_verification_code' })
    return true
  }
  if (/^\/applications\/[^/]+\/grant$/.test(path) && req.method === 'DELETE') {
    res.writeHead(204)
    res.end()
    return true
  }
  if (/^\/app\/installations\/1\/access_tokens$/.test(path) && req.method === 'POST') {
    send(res, 201, { token: `ghs_e2e${randomBytes(12).toString('hex')}`, expires_at: new Date(Date.now() + 3600_000).toISOString() })
    return true
  }
  const auth = (req.headers.authorization ?? '').replace(/^Bearer /, '')
  if (!userTokens.has(auth)) return false
  if (path === '/user') return send(res, 200, { id: 9001, login: LOGIN, name: 'Asha Example', avatar_url: null }), true
  if (path === '/user/installations') {
    send(res, 200, { total_count: 1, installations: [{ id: 1, app_id: 1, app_slug: 'lee-e2e', account: { login: LOGIN }, repository_selection: 'selected', permissions: { contents: 'write', metadata: 'read' } }] })
    return true
  }
  if (path === '/user/installations/1/repositories') return send(res, 200, { total_count: REPOS.length, repositories: REPOS }), true
  if (path === `/users/${LOGIN}/repos`) return send(res, 200, REPOS.filter((r) => !r.private)), true
  if (path === '/user/starred') return send(res, 200, [{ full_name: 'vercel/next.js' }]), true
  if (path === '/search/issues') return send(res, 200, { total_count: 3, items: [] }), true
  const m = /^\/repos\/([^/]+\/[^/]+)\/(languages|commits)$/.exec(path)
  if (m) {
    if (m[2] === 'languages') return send(res, 200, { TypeScript: 800, PHP: 200 }), true
    res.writeHead(200, { 'content-type': 'application/json', link: `<${url.origin}${path}?page=24>; rel="last"` })
    res.end(JSON.stringify([{ commit: { author: { date: '2026-09-19T08:00:00Z' } } }]))
    return true
  }
  return false
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const testPath = url.searchParams.get('path') ?? 'profile.json'
  if (url.pathname === '/health') return send(res, 200, { ok: true })
  if (url.pathname === '/__test/file') {
    const text = files.get(testPath) ?? null
    return send(res, 200, { text, sha: text === null ? null : sha(text), commits })
  }
  if (url.pathname === '/__test/edit' && req.method === 'POST') {
    const text = await readBody(req)
    files.set(testPath, text)
    return send(res, 200, { sha: sha(text) })
  }
  if (await appRoute(req, res, url)) return
  const auth = req.headers.authorization ?? ''
  if (!auth.startsWith('Bearer github_pat_') && !auth.startsWith('Bearer ghs_')) return send(res, 401, { message: 'Bad credentials' })
  const m = /^\/repos\/([^/]+)\/([^/]+)(?:\/contents\/(.+))?$/.exec(url.pathname)
  if (!m) return send(res, 404, { message: 'Not Found' })
  if (!m[3]) return send(res, 200, { full_name: `${m[1]}/${m[2]}`, default_branch: 'main' })
  const path = decodeURIComponent(m[3])
  const text = files.get(path) ?? null
  const current = text === null ? null : sha(text)
  if (req.method === 'GET') {
    if (text === null) return send(res, 404, { message: 'Not Found' })
    return send(res, 200, { type: 'file', sha: current, encoding: 'base64', content: Buffer.from(text).toString('base64') })
  }
  if (req.method === 'PUT') {
    const body = JSON.parse(await readBody(req))
    if ((body.sha ?? null) !== current) return send(res, current === null ? 422 : 409, { message: 'sha mismatch' })
    const next = Buffer.from(body.content, 'base64').toString('utf8')
    files.set(path, next)
    return send(res, current === null ? 201 : 200, { content: { sha: sha(next) }, commit: commit(m[1], m[2]) })
  }
  if (req.method === 'DELETE') {
    const body = JSON.parse(await readBody(req))
    if (text === null) return send(res, 404, { message: 'Not Found' })
    if (body.sha !== current) return send(res, 409, { message: 'sha mismatch' })
    files.delete(path)
    return send(res, 200, { content: null, commit: commit(m[1], m[2]) })
  }
  send(res, 405, { message: 'Method not allowed' })
}).listen(PORT, () => {
  process.stdout.write(`github stub on ${PORT}\n`)
})
