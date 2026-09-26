import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import * as documentsQ from '@/lib/db/queries/documents'
import * as assetsQ from '@/lib/db/queries/documentAssets'
import { getAssetStoreForUser } from '@/lib/storage/asset-store'
import { DriveError } from '@/lib/drive/errors'
import { findStrandedUpload } from '@/lib/drive/uploads'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * GET /api/documents/[id]/assets
 *   → 200 { assets: AssetMetadata[] }
 *
 * Returns metadata only (never bytes) so an editor sidebar can render the
 * list without paying for the payload.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const { id } = await ctx.params
    const doc = await documentsQ.getById(userId, id)
    if (!doc) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    const assets = await assetsQ.list(userId, id)
    return NextResponse.json({ assets })
  } catch (err) {
    logger.error('GET /api/documents/[id]/assets failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not list assets.' }, { status: 500 })
  }
}

/**
 * POST /api/documents/[id]/assets
 *   multipart/form-data, one or more `file` fields
 *   → 200 { assets: AssetMetadata[], errors?: {filename, error}[] }
 *
 * Uploads may partially succeed: per-file validation errors go into the
 * `errors` array so the client can toast them individually while the
 * successful uploads are still inserted. Auth failure, missing document,
 * or a total parse failure return a 4xx with no work done.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

    const { id } = await ctx.params
    const doc = await documentsQ.getById(userId, id)
    if (!doc) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

    let form: FormData
    try {
      form = await req.formData()
    } catch (err) {
      logger.error('assets upload: bad multipart body', {
        err: err instanceof Error ? err.message : String(err),
      })
      return NextResponse.json({ error: 'Invalid multipart body.' }, { status: 400 })
    }

    // Accept `file` (single) or `files` (multi) field names — form APIs vary.
    const files: File[] = []
    for (const value of [...form.getAll('file'), ...form.getAll('files')]) {
      if (value instanceof File && value.size > 0) files.push(value)
    }
    if (files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded.' }, { status: 400 })
    }

    // Bytes go through the asset store, which enforces the per-user storage
    // quota (ASSET_QUOTA_BYTES) on top of the per-file / per-document caps.
    const store = await getAssetStoreForUser(userId)
    const created: assetsQ.AssetMetadata[] = []
    const errors: { filename: string; error: string }[] = []
    let connect = false
    // Fallback from a failed browser-direct upload: if the bytes did reach
    // Drive, register that file instead of uploading a second copy.
    const uploadId = form.get('uploadId')
    if (typeof uploadId === 'string' && uploadId && files.length === 1) {
      try {
        const stranded = await findStrandedUpload(userId, id, uploadId, files[0]!.size)
        if (stranded) return NextResponse.json({ assets: [stranded] })
      } catch (err) {
        logger.warn('assets upload: stranded-upload lookup failed', {
          err: err instanceof Error ? err.message : String(err),
        })
      }
    }
    for (const file of files) {
      try {
        const bytes = Buffer.from(await file.arrayBuffer())
        const { asset } = await store.put(
          userId,
          { kind: 'document-asset', documentId: id, filename: file.name },
          bytes,
          { mimeType: file.type || 'application/octet-stream' },
        )
        if (asset) created.push(asset)
      } catch (err) {
        if (err instanceof assetsQ.AssetValidationError) {
          errors.push({ filename: file.name, error: err.message })
        } else if (err instanceof DriveError) {
          connect ||= err.needsConnect
          errors.push({ filename: file.name, error: err.message })
        } else {
          logger.error('assets upload: insert failed', {
            filename: file.name,
            err: err instanceof Error ? err.message : String(err),
          })
          errors.push({ filename: file.name, error: 'Could not upload file.' })
        }
      }
    }

    return NextResponse.json({
      assets: created,
      errors: errors.length ? errors : undefined,
      connect: connect || undefined,
    })
  } catch (err) {
    logger.error('POST /api/documents/[id]/assets failed', {
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
    return NextResponse.json({ error: 'Could not upload assets.' }, { status: 500 })
  }
}
