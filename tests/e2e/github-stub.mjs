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
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'

const PORT = Number(process.env.GITHUB_STUB_PORT ?? 3199)
const files = new Map()
let commits = 0

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
  const auth = req.headers.authorization ?? ''
  if (!auth.startsWith('Bearer github_pat_')) return send(res, 401, { message: 'Bad credentials' })
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
