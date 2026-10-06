import { createHash } from 'node:crypto'

/**
 * In-memory GitHub contents API for one repo, as a `fetch` replacement:
 * GET /repos/:o/:r, GET/PUT/DELETE /repos/:o/:r/contents/:path. Blob shas
 * are content hashes, so a hand edit changes the sha like on GitHub. Any
 * path in the repo can hold a file; `path` is the primary one (profile.json)
 * the single-file helpers refer to.
 */
export interface FakeGitHub {
  fetch: typeof fetch
  /** Current text of the primary file, or null when absent. */
  file(): string | null
  sha(): string | null
  /** Any file in the repo. */
  fileAt(path: string): string | null
  shaAt(path: string): string | null
  /** Simulate an edit on github.com (primary file). */
  editByHand(text: string): void
  /** Simulate an edit (or, with null, a deletion) of any file on github.com. */
  editAt(path: string, text: string | null): void
  /** Make the next PUT answer 409 after changing the file underneath. */
  raceNextPut(text: string): void
  puts: Array<{ path: string; message: string; sha: string | null; text: string; authorization: string | null }>
  deletes: Array<{ path: string; message: string; sha: string }>
  requests: Array<{ method: string; url: string; authorization: string | null }>
}

function blobSha(text: string): string {
  return createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0${text}`).digest('hex')
}

export function fakeGitHub(opts: { owner: string; repo: string; path: string; token: string; initial?: string; writable?: boolean }): FakeGitHub {
  const files = new Map<string, string>()
  if (opts.initial !== undefined) files.set(opts.path, opts.initial)
  let race: string | null = null
  let commit = 0
  const puts: FakeGitHub['puts'] = []
  const deletes: FakeGitHub['deletes'] = []
  const requests: FakeGitHub['requests'] = []
  const repoPath = `/repos/${opts.owner}/${opts.repo}`
  const contentsPrefix = `${repoPath}/contents/`

  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  const nextCommit = (): { sha: string; html_url: string } => {
    commit += 1
    const sha = createHash('sha1').update(`commit ${commit}`).digest('hex')
    return { sha, html_url: `https://github.com/${opts.owner}/${opts.repo}/commit/${sha}` }
  }

  const put = (path: string, init: RequestInit, authorization: string | null): Response => {
    if (opts.writable === false) return json(403, { message: 'Resource not accessible by personal access token' })
    const body = JSON.parse(String(init.body)) as { message: string; content: string; sha?: string }
    const incoming = Buffer.from(body.content, 'base64').toString('utf8')
    if (race !== null) {
      files.set(path, race)
      race = null
      return json(409, { message: 'is at x but expected y' })
    }
    const text = files.get(path)
    const current = text === undefined ? null : blobSha(text)
    if (current !== (body.sha ?? null)) return json(current === null ? 422 : 409, { message: 'sha mismatch' })
    files.set(path, incoming)
    puts.push({ path, message: body.message, sha: body.sha ?? null, text: incoming, authorization })
    return json(current === null ? 201 : 200, { content: { sha: blobSha(incoming) }, commit: nextCommit() })
  }

  const del = (path: string, init: RequestInit): Response => {
    if (opts.writable === false) return json(403, { message: 'Resource not accessible by personal access token' })
    const body = JSON.parse(String(init.body)) as { message: string; sha: string }
    const text = files.get(path)
    if (text === undefined) return json(404, { message: 'Not Found' })
    if (blobSha(text) !== body.sha) return json(409, { message: 'sha mismatch' })
    files.delete(path)
    deletes.push({ path, message: body.message, sha: body.sha })
    return json(200, { content: null, commit: nextCommit() })
  }

  const impl = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const method = (init.method ?? 'GET').toUpperCase()
    const headers = new Headers(init.headers)
    const authorization = headers.get('authorization')
    requests.push({ method, url: url.pathname + url.search, authorization })
    if (authorization !== `Bearer ${opts.token}`) return json(401, { message: 'Bad credentials' })
    if (url.pathname === repoPath && method === 'GET') return json(200, { full_name: `${opts.owner}/${opts.repo}`, default_branch: 'main' })
    if (!url.pathname.startsWith(contentsPrefix)) return json(404, { message: 'Not Found' })
    const path = decodeURIComponent(url.pathname.slice(contentsPrefix.length))
    if (method === 'GET') {
      const text = files.get(path)
      if (text === undefined) return json(404, { message: 'Not Found' })
      return json(200, { type: 'file', sha: blobSha(text), encoding: 'base64', content: Buffer.from(text).toString('base64').replace(/(.{60})/g, '$1\n') })
    }
    if (method === 'PUT') return put(path, init, authorization)
    if (method === 'DELETE') return del(path, init)
    return json(405, { message: 'Method not allowed' })
  }

  const textAt = (path: string): string | null => files.get(path) ?? null
  return {
    fetch: impl as typeof fetch,
    file: () => textAt(opts.path),
    sha: () => {
      const t = textAt(opts.path)
      return t === null ? null : blobSha(t)
    },
    fileAt: textAt,
    shaAt: (path) => {
      const t = textAt(path)
      return t === null ? null : blobSha(t)
    },
    editByHand: (next) => {
      files.set(opts.path, next)
    },
    editAt: (path, next) => {
      if (next === null) files.delete(path)
      else files.set(path, next)
    },
    raceNextPut: (next) => {
      race = next
    },
    puts,
    deletes,
    requests,
  }
}
