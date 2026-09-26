import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import * as documentsQ from '@/lib/db/queries/documents'
import * as assetsQ from '@/lib/db/queries/documentAssets'
import { getAssetStore } from '@/lib/storage/asset-store'
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
    const store = getAssetStore()
    const created: assetsQ.AssetMetadata[] = []
    const errors: { filename: string; error: string }[] = []
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
        } else {
          logger.error('assets upload: insert failed', {
            filename: file.name,
            err: err instanceof Error ? err.message : String(err),
          })
          errors.push({ filename: file.name, error: 'Could not upload file.' })
        }
      }
    }

    return NextResponse.json({ assets: created, errors: errors.length ? errors : undefined })
  } catch (err) {
    logger.error('POST /api/documents/[id]/assets failed', {
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
    return NextResponse.json({ error: 'Could not upload assets.' }, { status: 500 })
  }
}
