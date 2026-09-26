import { createHash } from 'node:crypto'

/**
 * In-memory fake of the slice of Google Drive API v3 (+ the OAuth token
 * endpoint) that Employ uses, installed as a `fetch` mock. Files are owned
 * by the bearer token that created them, mirroring `drive.file`: another
 * user's token gets a 404 for them.
 */

export interface FakeFile {
  id: string
  owner: string
  name: string
  mimeType: string
  parents: string[]
  appProperties: Record<string, string>
  trashed: boolean
  bytes: Buffer
}

interface Session {
  owner: string
  meta: { name: string; mimeType: string; parents?: string[]; appProperties?: Record<string, string> }
  origin: string | null
}

const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex')

export class FakeDrive {
  files = new Map<string, FakeFile>()
  sessions = new Map<string, Session>()
  calls: { method: string; url: string }[] = []
  /** Every Drive call answers 401 (revoked grant). */
  revoked = false
  /** Uploads answer 403 storageQuotaExceeded. */
  quotaFull = false
  /** Omit sha256Checksum from metadata (forces a hash-by-download). */
  omitSha = false
  /** Report this sha256 instead of the real one (verification failure). */
  corruptSha = false
  /** Upload calls left before uploads start failing with 503 (-1 = never). */
  uploadsBeforeOutage = -1
  /** OAuth token endpoint behaviour. */
  tokenResponse: { status: number; body: unknown } = {
    status: 200,
    body: { access_token: 'scoped-token', expires_in: 3599, scope: 'https://www.googleapis.com/auth/drive.file' },
  }
  tokenRequests: URLSearchParams[] = []
  private seq = 0

  newId(): string {
    this.seq += 1
    return `drv_${String(this.seq).padStart(8, '0')}`
  }

  /** Put a file straight into the fake (e.g. a user's own file for the Picker). */
  seed(owner: string, file: Partial<FakeFile> & { name: string; bytes: Buffer }): FakeFile {
    const f: FakeFile = {
      id: this.newId(),
      owner,
      mimeType: 'application/octet-stream',
      parents: ['root'],
      appProperties: {},
      trashed: false,
      ...file,
    }
    this.files.set(f.id, f)
    return f
  }

  count(pred: (f: FakeFile) => boolean): number {
    return [...this.files.values()].filter(pred).length
  }

  uploads(): number {
    return this.calls.filter((c) => c.url.includes('/upload/drive/v3/') && c.method !== 'PATCH').length
  }

  folderCreates(): number {
    return this.calls.filter((c) => c.method === 'POST' && c.url.startsWith('https://www.googleapis.com/drive/v3/files?')).length
  }

  private meta(f: FakeFile): Record<string, unknown> {
    return {
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: String(f.bytes.byteLength),
      ...(this.omitSha || f.mimeType.startsWith('application/vnd.google-apps.')
        ? {}
        : { sha256Checksum: this.corruptSha ? 'f'.repeat(64) : sha(f.bytes) }),
      parents: f.parents,
      appProperties: f.appProperties,
      trashed: f.trashed,
    }
  }

  private json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    })
  }

  private err(status: number, reason: string): Response {
    return this.json(status, { error: { code: status, message: reason, errors: [{ reason }] } })
  }

  private owned(id: string, owner: string): FakeFile | null {
    const f = this.files.get(id)
    return f && f.owner === owner ? f : null
  }

  private matches(q: string, f: FakeFile): boolean {
    if (/trashed = false/.test(q) && f.trashed) return false
    const prop = /appProperties has \{ key='([^']*)' and value='([^']*)' \}/.exec(q)
    if (prop) return f.appProperties[prop[1]!] === prop[2]
    const name = /name = '((?:[^'\\]|\\.)*)'/.exec(q)
    const parent = /'([^']+)' in parents/.exec(q)
    if (name && f.name !== name[1]!.replace(/\\(.)/g, '$1')) return false
    if (parent && !f.parents.includes(parent[1]!)) return false
    if (/mimeType = 'application\/vnd.google-apps.folder'/.test(q) && f.mimeType !== 'application/vnd.google-apps.folder') {
      return false
    }
    return true
  }

  private create(owner: string, meta: Session['meta'], bytes: Buffer): FakeFile {
    const f: FakeFile = {
      id: this.newId(),
      owner,
      name: meta.name,
      mimeType: meta.mimeType,
      parents: meta.parents ?? ['root'],
      appProperties: meta.appProperties ?? {},
      trashed: false,
      bytes,
    }
    this.files.set(f.id, f)
    return f
  }

  private uploadGate(): Response | null {
    if (this.quotaFull) return this.err(403, 'storageQuotaExceeded')
    if (this.uploadsBeforeOutage === 0) return this.err(503, 'backendError')
    if (this.uploadsBeforeOutage > 0) this.uploadsBeforeOutage -= 1
    return null
  }

  private parseMultipart(body: Buffer, contentType: string): { meta: Session['meta']; bytes: Buffer } {
    const boundary = /boundary=(.+)$/.exec(contentType)![1]!
    const text = body.toString('latin1')
    const first = text.indexOf('\r\n\r\n') + 4
    const sep = `\r\n--${boundary}\r\n`
    const jsonEnd = text.indexOf(sep, first)
    const meta = JSON.parse(Buffer.from(text.slice(first, jsonEnd), 'latin1').toString('utf8')) as Session['meta']
    const dataStart = text.indexOf('\r\n\r\n', jsonEnd + sep.length) + 4
    const dataEnd = text.lastIndexOf(`\r\n--${boundary}--`)
    return { meta, bytes: body.subarray(dataStart, dataEnd) }
  }

  fetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const method = (init.method ?? 'GET').toUpperCase()
    this.calls.push({ method, url })
    const headers = new Headers(init.headers)
    const raw = init.body
    const body =
      raw == null
        ? Buffer.alloc(0)
        : raw instanceof URLSearchParams
          ? Buffer.from(raw.toString())
          : Buffer.from(raw as Uint8Array | string)

    if (url === 'https://oauth2.googleapis.com/token') {
      this.tokenRequests.push(new URLSearchParams(body.toString('utf8')))
      return this.json(this.tokenResponse.status, this.tokenResponse.body)
    }

    // Browser PUT to a resumable session URI: authorised by the URI itself.
    const session = this.sessions.get(url)
    if (session && method === 'PUT') {
      const gate = this.uploadGate()
      if (gate) return gate
      this.sessions.delete(url)
      return this.json(200, this.meta(this.create(session.owner, session.meta, body)))
    }

    if (!url.startsWith('https://www.googleapis.com/')) throw new Error(`unexpected fetch ${url}`)
    const auth = headers.get('authorization') ?? ''
    if (this.revoked || !auth.startsWith('Bearer ')) return this.err(401, 'authError')
    const owner = auth.slice(7)
    const u = new URL(url)
    const path = u.pathname

    if (path === '/upload/drive/v3/files' && method === 'POST') {
      const gate = this.uploadGate()
      if (gate) return gate
      const type = u.searchParams.get('uploadType')
      if (type === 'multipart') {
        const { meta, bytes } = this.parseMultipart(body, headers.get('content-type') ?? '')
        if (meta.parents?.some((p) => p !== 'root' && !this.owned(p, owner))) return this.err(404, 'notFound')
        return this.json(200, this.meta(this.create(owner, meta, Buffer.from(bytes))))
      }
      if (type === 'resumable') {
        const meta = JSON.parse(body.toString('utf8')) as Session['meta']
        if (meta.parents?.some((p) => p !== 'root' && !this.owned(p, owner))) return this.err(404, 'notFound')
        const location = `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${this.newId()}`
        this.sessions.set(location, { owner, meta, origin: headers.get('origin') })
        return new Response(null, { status: 200, headers: { location } })
      }
    }

    const media = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(path)
    if (media && method === 'PATCH') {
      const f = this.owned(decodeURIComponent(media[1]!), owner)
      if (!f) return this.err(404, 'notFound')
      f.bytes = Buffer.from(body)
      return this.json(200, this.meta(f))
    }

    if (path === '/drive/v3/files' && method === 'GET') {
      const q = u.searchParams.get('q') ?? ''
      const files = [...this.files.values()].filter((f) => f.owner === owner && this.matches(q, f))
      return this.json(200, { files: files.slice(0, 1).map((f) => this.meta(f)) })
    }
    if (path === '/drive/v3/files' && method === 'POST') {
      const meta = JSON.parse(body.toString('utf8')) as Session['meta']
      if (meta.parents?.some((p) => p !== 'root' && !this.owned(p, owner))) return this.err(404, 'notFound')
      return this.json(200, { id: this.create(owner, meta, Buffer.alloc(0)).id })
    }

    const one = /^\/drive\/v3\/files\/([^/]+)$/.exec(path)
    if (one) {
      const f = this.owned(decodeURIComponent(one[1]!), owner)
      if (!f) return this.err(404, 'notFound')
      if (method === 'GET' && u.searchParams.get('alt') === 'media') {
        return new Response(new Uint8Array(f.bytes), {
          status: 200,
          headers: { 'content-type': f.mimeType, 'content-length': String(f.bytes.byteLength) },
        })
      }
      if (method === 'GET') return this.json(200, this.meta(f))
      if (method === 'PATCH') {
        const patch = JSON.parse(body.toString('utf8')) as { trashed?: boolean }
        if (patch.trashed) f.trashed = true
        return this.json(200, { id: f.id })
      }
    }
    throw new Error(`fake drive: unhandled ${method} ${url}`)
  }
}
