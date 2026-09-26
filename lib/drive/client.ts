import { createHash, randomUUID } from 'node:crypto'
import { getGoogleTokens } from '@/lib/google/tokens'
import { logger } from '@/lib/logger'
import { DRIVE_TIMEOUT_MS, fetchWithTimeout } from '@/lib/net/timeout'
import { DriveError, toDriveError } from './errors'

/**
 * Minimal Google Drive API v3 REST client (no SDK: keeps the bundle small and
 * every call on fetchWithTimeout). Docs:
 *   uploads    https://developers.google.com/workspace/drive/api/guides/manage-uploads
 *   downloads  https://developers.google.com/workspace/drive/api/guides/manage-downloads
 *   folders    https://developers.google.com/workspace/drive/api/guides/folder
 *   search     https://developers.google.com/workspace/drive/api/guides/search-files
 */

export const DRIVE_API = 'https://www.googleapis.com/drive/v3'
export const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
export const FOLDER_MIME = 'application/vnd.google-apps.folder'
const FILE_FIELDS = 'id,name,mimeType,size,sha256Checksum,parents,appProperties,trashed'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  /** Decimal string (Drive returns int64 as string). */
  size?: string
  sha256Checksum?: string
  parents?: string[]
  appProperties?: Record<string, string>
  trashed?: boolean
}

export interface NewFileMeta {
  name: string
  mimeType: string
  parents?: string[]
  appProperties?: Record<string, string>
}

type TokenSource = () => Promise<string>

/** Access token for a user's Google account (refreshed server-side). */
export function userTokenSource(userId: string): TokenSource {
  return async () => {
    try {
      return (await getGoogleTokens(userId)).accessToken
    } catch (err) {
      throw toDriveError(err)
    }
  }
}

/** Escape a value for a Drive `q` string literal. */
export function qLiteral(v: string): string {
  return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

interface DriveErrorBody {
  error?: { code?: number; message?: string; errors?: Array<{ reason?: string }> }
}

async function mapHttpError(res: Response, label: string): Promise<DriveError> {
  const body = (await res.json().catch(() => ({}))) as DriveErrorBody
  const reasons = (body.error?.errors ?? []).map((e) => e.reason ?? '')
  logger.warn('drive_api_error', { label, status: res.status, reasons: reasons.join(',') })
  if (res.status === 401) return new DriveError('reconnect')
  if (res.status === 403) {
    if (reasons.some((r) => r === 'storageQuotaExceeded' || r === 'quotaExceeded')) {
      return new DriveError('quota')
    }
    if (reasons.some((r) => /insufficient|authError|appNotAuthorized/i.test(r))) {
      return new DriveError('reconnect')
    }
    if (reasons.some((r) => /rateLimit/i.test(r))) return new DriveError('unavailable')
    return new DriveError('reconnect')
  }
  if (res.status === 404) return new DriveError('not_found')
  return new DriveError('unavailable')
}

export class DriveClient {
  constructor(private readonly token: TokenSource) {}

  private async call(url: string, init: RequestInit, label: string): Promise<Response> {
    const accessToken = await this.token()
    let res: Response
    try {
      res = await fetchWithTimeout(
        url,
        { ...init, headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${accessToken}` } },
        { timeoutMs: DRIVE_TIMEOUT_MS, label },
      )
    } catch (err) {
      logger.warn('drive_fetch_failed', { label, err: err instanceof Error ? err.message : String(err) })
      throw toDriveError(err)
    }
    if (!res.ok) throw await mapHttpError(res, label)
    return res
  }

  private async json<T>(url: string, init: RequestInit, label: string): Promise<T> {
    const res = await this.call(url, init, label)
    return (await res.json()) as T
  }

  /** First non-trashed folder called `name` under `parentId` visible to the app. */
  async findFolder(name: string, parentId: string): Promise<string | null> {
    const q = `name = ${qLiteral(name)} and mimeType = '${FOLDER_MIME}' and ${qLiteral(parentId)} in parents and trashed = false`
    const url = `${DRIVE_API}/files?${new URLSearchParams({ q, fields: 'files(id)', pageSize: '1', spaces: 'drive' })}`
    const out = await this.json<{ files?: Array<{ id: string }> }>(url, { method: 'GET' }, 'drive find folder')
    return out.files?.[0]?.id ?? null
  }

  async createFolder(name: string, parentId: string): Promise<string> {
    const out = await this.json<{ id: string }>(
      `${DRIVE_API}/files?fields=id`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
      },
      'drive create folder',
    )
    return out.id
  }

  /** A non-trashed app file tagged with appProperties[key] = value. */
  async findByAppProperty(key: string, value: string): Promise<DriveFile | null> {
    const q = `appProperties has { key=${qLiteral(key)} and value=${qLiteral(value)} } and trashed = false`
    const url = `${DRIVE_API}/files?${new URLSearchParams({ q, fields: `files(${FILE_FIELDS})`, pageSize: '1', spaces: 'drive' })}`
    const out = await this.json<{ files?: DriveFile[] }>(url, { method: 'GET' }, 'drive find by property')
    return out.files?.[0] ?? null
  }

  /** One-request multipart upload (metadata + bytes); fine for ≤5 MB files. */
  async uploadMultipart(input: NewFileMeta, bytes: Uint8Array): Promise<DriveFile> {
    // The MIME type ends up in a part header: never let it carry CR/LF.
    const meta = { ...input, mimeType: safeMimeType(input.mimeType) }
    const boundary = `employ-${randomUUID()}`
    const head = Buffer.from(
      `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
        `--${boundary}\r\ncontent-type: ${meta.mimeType}\r\n\r\n`,
    )
    const tail = Buffer.from(`\r\n--${boundary}--`)
    const body = Buffer.concat([head, Buffer.from(bytes), tail])
    return this.json<DriveFile>(
      `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=${FILE_FIELDS}`,
      {
        method: 'POST',
        headers: { 'content-type': `multipart/related; boundary=${boundary}` },
        body: new Uint8Array(body),
      },
      'drive upload',
    )
  }

  /** Replace a file's content (used to overwrite a document's cached PDF). */
  async updateMedia(fileId: string, bytes: Uint8Array, mimeType: string): Promise<DriveFile> {
    return this.json<DriveFile>(
      `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=${FILE_FIELDS}`,
      { method: 'PATCH', headers: { 'content-type': mimeType }, body: new Uint8Array(bytes) },
      'drive update media',
    )
  }

  /**
   * Start a resumable upload session and return its session URI. The browser
   * then PUTs the bytes straight to Google; the URI itself authorises that
   * one upload (valid for a week), so no token ever reaches the browser.
   * `origin` makes Google answer the browser's cross-origin PUT with CORS
   * headers.
   */
  async createResumableSession(
    input: NewFileMeta,
    opts: { sizeBytes: number; origin?: string },
  ): Promise<string> {
    const meta = { ...input, mimeType: safeMimeType(input.mimeType) }
    const headers: Record<string, string> = {
      'content-type': 'application/json; charset=UTF-8',
      'x-upload-content-type': meta.mimeType,
      'x-upload-content-length': String(opts.sizeBytes),
    }
    if (opts.origin) headers.origin = opts.origin
    const res = await this.call(
      `${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=${FILE_FIELDS}`,
      { method: 'POST', headers, body: JSON.stringify(meta) },
      'drive resumable session',
    )
    const location = res.headers.get('location')
    if (!location || !location.startsWith(`${DRIVE_UPLOAD_API}/`)) {
      throw new DriveError('unavailable')
    }
    return location
  }

  async getFile(fileId: string): Promise<DriveFile> {
    return this.json<DriveFile>(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=${FILE_FIELDS}`,
      { method: 'GET' },
      'drive get file',
    )
  }

  /** Raw content response (`alt=media`); the caller streams or buffers it. */
  async download(fileId: string): Promise<Response> {
    return this.call(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`,
      { method: 'GET' },
      'drive download',
    )
  }

  async downloadBytes(fileId: string): Promise<Buffer> {
    const res = await this.download(fileId)
    return Buffer.from(await res.arrayBuffer())
  }

  /** Move to Drive trash (recoverable for 30 days). A missing file is fine. */
  async trash(fileId: string): Promise<void> {
    try {
      await this.call(
        `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json; charset=UTF-8' },
          body: JSON.stringify({ trashed: true }),
        },
        'drive trash',
      )
    } catch (err) {
      if (err instanceof DriveError && err.code === 'not_found') return
      throw err
    }
  }

  /** sha256 of a file: Drive's checksum when present, else hash the bytes. */
  async sha256Of(file: DriveFile): Promise<string> {
    if (file.sha256Checksum) return file.sha256Checksum.toLowerCase()
    const bytes = await this.downloadBytes(file.id)
    return createHash('sha256').update(bytes).digest('hex')
  }
}

const MIME = /^[\w.+-]+\/[\w.+-]+$/

/** A well-formed `type/subtype`, else application/octet-stream. */
export function safeMimeType(mime: string | undefined | null): string {
  const m = (mime ?? '').trim().toLowerCase()
  return m.length <= 200 && MIME.test(m) ? m : 'application/octet-stream'
}

/** Parse Drive's int64-as-string size. */
export function driveSize(file: DriveFile): number {
  const n = Number(file.size ?? NaN)
  return Number.isFinite(n) ? n : 0
}
