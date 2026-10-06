// E2E only: a stand-in for the GitHub contents API, so Publish runs end to
// end without the network or a real token. The e2e dev server points lee
// at it with GITHUB_API_URL (tests/e2e/env.ts). One in-memory repo; any
// token starting with "github_pat_" is accepted.
//
//   GET  /health                          → 200
//   GET  /repos/:owner/:repo              → repo metadata
//   GET  /repos/:owner/:repo/contents/:p  → the file (404 until created)
//   PUT  /repos/:owner/:repo/contents/:p  → create / update with sha check
//   POST /__test/edit                     → replace the file (a "hand edit")
//   GET  /__test/file                     → { text, sha, commits }
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'

const PORT = Number(process.env.GITHUB_STUB_PORT ?? 3199)
let text = null
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

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  if (url.pathname === '/health') return send(res, 200, { ok: true })
  if (url.pathname === '/__test/file') return send(res, 200, { text, sha: text === null ? null : sha(text), commits })
  if (url.pathname === '/__test/edit' && req.method === 'POST') {
    text = await readBody(req)
    return send(res, 200, { sha: sha(text) })
  }
  const auth = req.headers.authorization ?? ''
  if (!auth.startsWith('Bearer github_pat_')) return send(res, 401, { message: 'Bad credentials' })
  const m = /^\/repos\/([^/]+)\/([^/]+)(?:\/contents\/(.+))?$/.exec(url.pathname)
  if (!m) return send(res, 404, { message: 'Not Found' })
  if (!m[3]) return send(res, 200, { full_name: `${m[1]}/${m[2]}`, default_branch: 'main' })
  if (req.method === 'GET') {
    if (text === null) return send(res, 404, { message: 'Not Found' })
    return send(res, 200, { type: 'file', sha: sha(text), encoding: 'base64', content: Buffer.from(text).toString('base64') })
  }
  if (req.method === 'PUT') {
    const body = JSON.parse(await readBody(req))
    const current = text === null ? null : sha(text)
    if ((body.sha ?? null) !== current) return send(res, current === null ? 422 : 409, { message: 'sha mismatch' })
    text = Buffer.from(body.content, 'base64').toString('utf8')
    commits += 1
    const commitSha = createHash('sha1').update(`commit ${commits}`).digest('hex')
    return send(res, current === null ? 201 : 200, {
      content: { sha: sha(text) },
      commit: { sha: commitSha, html_url: `https://github.com/${m[1]}/${m[2]}/commit/${commitSha}` },
    })
  }
  send(res, 405, { message: 'Method not allowed' })
}).listen(PORT, () => {
  process.stdout.write(`github stub on ${PORT}\n`)
})
