import { createHash } from 'node:crypto'

/**
 * In-memory GitHub contents API for one repo, as a `fetch` replacement:
 * GET /repos/:o/:r, GET/PUT /repos/:o/:r/contents/:path. Blob shas are
 * content hashes, so a hand edit changes the sha like on GitHub.
 */
export interface FakeGitHub {
  fetch: typeof fetch
  /** Current file text, or null when absent. */
  file(): string | null
  sha(): string | null
  /** Simulate an edit on github.com. */
  editByHand(text: string): void
  /** Make the next PUT answer 409 after changing the file underneath. */
  raceNextPut(text: string): void
  puts: Array<{ message: string; sha: string | null; text: string; authorization: string | null }>
  requests: Array<{ method: string; url: string; authorization: string | null }>
}

function blobSha(text: string): string {
  return createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0${text}`).digest('hex')
}

export function fakeGitHub(opts: { owner: string; repo: string; path: string; token: string; initial?: string; writable?: boolean }): FakeGitHub {
  let text: string | null = opts.initial ?? null
  let race: string | null = null
  let commit = 0
  const puts: FakeGitHub['puts'] = []
  const requests: FakeGitHub['requests'] = []
  const repoPath = `/repos/${opts.owner}/${opts.repo}`
  const contentsPath = `${repoPath}/contents/${opts.path}`

  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  const impl = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const method = (init.method ?? 'GET').toUpperCase()
    const headers = new Headers(init.headers)
    const authorization = headers.get('authorization')
    requests.push({ method, url: url.pathname + url.search, authorization })
    if (authorization !== `Bearer ${opts.token}`) return json(401, { message: 'Bad credentials' })
    if (url.pathname === repoPath && method === 'GET') return json(200, { full_name: `${opts.owner}/${opts.repo}`, default_branch: 'main' })
    if (url.pathname !== contentsPath) return json(404, { message: 'Not Found' })
    if (method === 'GET') {
      if (text === null) return json(404, { message: 'Not Found' })
      return json(200, { type: 'file', sha: blobSha(text), encoding: 'base64', content: Buffer.from(text).toString('base64').replace(/(.{60})/g, '$1\n') })
    }
    if (method === 'PUT') {
      if (opts.writable === false) return json(403, { message: 'Resource not accessible by personal access token' })
      const body = JSON.parse(String(init.body)) as { message: string; content: string; sha?: string }
      const incoming = Buffer.from(body.content, 'base64').toString('utf8')
      if (race !== null) {
        text = race
        race = null
        return json(409, { message: 'is at x but expected y' })
      }
      const current = text === null ? null : blobSha(text)
      if (current !== (body.sha ?? null)) return json(current === null ? 422 : 409, { message: 'sha mismatch' })
      text = incoming
      puts.push({ message: body.message, sha: body.sha ?? null, text: incoming, authorization })
      commit += 1
      const commitSha = createHash('sha1').update(`commit ${commit}`).digest('hex')
      return json(current === null ? 201 : 200, {
        content: { sha: blobSha(incoming) },
        commit: { sha: commitSha, html_url: `https://github.com/${opts.owner}/${opts.repo}/commit/${commitSha}` },
      })
    }
    return json(405, { message: 'Method not allowed' })
  }

  return {
    fetch: impl as typeof fetch,
    file: () => text,
    sha: () => (text === null ? null : blobSha(text)),
    editByHand: (next) => {
      text = next
    },
    raceNextPut: (next) => {
      race = next
    },
    puts,
    requests,
  }
}
