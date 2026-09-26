'use client'
import type { AssetMetadata } from '@/lib/db/queries/documentAssets'

/**
 * Client side of document-asset uploads (A2).
 *
 * With Drive in use, the server opens a resumable session and the browser
 * PUTs the bytes straight to Google (no bytes through Vercel). If that PUT
 * fails for any reason (network, CORS), the file falls back to the classic
 * multipart POST, which carries the upload id so the server can adopt a
 * copy that did land in Drive instead of storing it twice.
 */

export interface UploadOutcome {
  asset?: AssetMetadata
  error?: string
  /** The server asked the UI to offer (re)connecting Google Drive. */
  connect?: boolean
}

const GENERIC = 'Upload failed.'

interface ErrorBody {
  error?: string
  connect?: boolean
}

async function readJson<T>(res: Response): Promise<T | null> {
  return (await res.json().catch(() => null)) as T | null
}

async function serverUpload(documentId: string, file: File, uploadId?: string): Promise<UploadOutcome> {
  const form = new FormData()
  form.append('file', file)
  if (uploadId) form.append('uploadId', uploadId)
  const res = await fetch(`/api/documents/${documentId}/assets`, { method: 'POST', body: form })
  const body = await readJson<{
    assets?: AssetMetadata[]
    errors?: { error: string }[]
    connect?: boolean
    error?: string
  }>(res)
  if (!res.ok) return { error: body?.error ?? GENERIC }
  const asset = body?.assets?.[0]
  if (asset) return { asset }
  return { error: body?.errors?.[0]?.error ?? GENERIC, connect: body?.connect }
}

export async function uploadAsset(documentId: string, file: File): Promise<UploadOutcome> {
  try {
    const res = await fetch(`/api/documents/${documentId}/assets/upload-session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: file.name, mimeType: file.type || 'application/octet-stream', size: file.size }),
    })
    const session = await readJson<
      ({ mode: 'direct'; uploadUrl: string; uploadId: string } | { mode: 'server' }) & ErrorBody
    >(res)
    if (!res.ok) return { error: session?.error ?? GENERIC, connect: session?.connect }
    if (session?.mode !== 'direct') return serverUpload(documentId, file)

    try {
      const put = await fetch(session.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file,
      })
      const uploaded = put.ok ? await readJson<{ id?: string }>(put) : null
      if (uploaded?.id) {
        const done = await fetch(`/api/documents/${documentId}/assets/complete`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ fileId: uploaded.id }),
        })
        const body = await readJson<{ asset?: AssetMetadata } & ErrorBody>(done)
        if (done.ok && body?.asset) return { asset: body.asset }
        return { error: body?.error ?? GENERIC, connect: body?.connect }
      }
    } catch {
      // Direct PUT blocked or dropped: fall through to the server path.
    }
    return serverUpload(documentId, file, session.uploadId)
  } catch {
    return { error: GENERIC }
  }
}

export async function attachFromDrive(documentId: string, fileIds: string[]): Promise<{
  assets: AssetMetadata[]
  errors: string[]
  connect?: boolean
}> {
  try {
    const res = await fetch(`/api/documents/${documentId}/assets/from-drive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fileIds }),
    })
    const body = await readJson<{ assets?: AssetMetadata[]; errors?: { error: string }[] } & ErrorBody>(res)
    if (!res.ok) return { assets: [], errors: [body?.error ?? 'Could not attach from Google Drive.'], connect: body?.connect }
    return { assets: body?.assets ?? [], errors: (body?.errors ?? []).map((e) => e.error) }
  } catch {
    return { assets: [], errors: ['Could not attach from Google Drive.'] }
  }
}

export interface DriveStatus {
  hasGoogleAccount: boolean
  connected: boolean
  enabled: boolean
  backend: 'drive' | 'postgres'
}

export async function fetchDriveStatus(): Promise<DriveStatus | null> {
  try {
    const res = await fetch('/api/drive/status', { cache: 'no-store' })
    return res.ok ? await readJson<DriveStatus>(res) : null
  } catch {
    return null
  }
}

export async function fetchPickerToken(): Promise<{ accessToken: string } | { error: string; connect?: boolean }> {
  try {
    const res = await fetch('/api/drive/picker-token', { cache: 'no-store' })
    const body = await readJson<{ accessToken?: string } & ErrorBody>(res)
    if (res.ok && body?.accessToken) return { accessToken: body.accessToken }
    return { error: body?.error ?? 'Could not open Google Drive.', connect: body?.connect }
  } catch {
    return { error: 'Could not open Google Drive.' }
  }
}
