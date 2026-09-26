import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import * as documentsQ from '@/lib/db/queries/documents'
import * as assetsQ from '@/lib/db/queries/documentAssets'
import { getAssetStoreForUser } from '@/lib/storage/asset-store'
import { DriveError, driveErrorResponse } from '@/lib/drive/errors'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'])

/**
 * GET /api/documents/[id]/assets/[filename]
 *   → 200 raw bytes with the stored MIME type
 *
 * Serves the asset payload for previews, thumbnails, and downloads. Public
 * cache-control is safe: (documentId, filename) is unique and immutable —
 * a rename creates a new URL and a re-upload requires a delete first.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; filename: string }> },
): Promise<Response> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const { id, filename } = await ctx.params
    // Next passes url-decoded params; still sanitise so we can't be tricked
    // into an odd lookup (e.g. an encoded slash).
    const decoded = decodeURIComponent(filename)
    if (decoded.includes('/') || decoded.includes('\\') || decoded.includes('..')) {
      return NextResponse.json({ error: 'Invalid filename.' }, { status: 400 })
    }

    const doc = await documentsQ.getById(userId, id)
    if (!doc) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

    const asset = await assetsQ.getMeta(userId, id, decoded)
    if (!asset) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    // Streams from Drive (or Postgres) through this authenticated route: the
    // browser never sees a Google token, and Drive bytes are piped, not
    // buffered. Private caching keeps repeat previews off the function.
    const store = await getAssetStoreForUser(userId)
    const stream = await store.openStream!(userId, store.refForDocumentAsset(asset))
    if (!stream) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

    const headers: Record<string, string> = {
      'content-type': asset.mimeType,
      'cache-control': 'private, max-age=3600',
      'x-content-type-options': 'nosniff',
    }
    // Only raster images and PDFs render inline; anything else (HTML, SVG,
    // scripts from a picked Drive file) downloads instead of running on our origin.
    if (!INLINE_TYPES.has(asset.mimeType)) {
      headers['content-disposition'] = `attachment; filename="${asset.filename}"`
    }
    if (stream.sizeBytes !== null) headers['content-length'] = String(stream.sizeBytes)
    return new Response(stream.body, { status: 200, headers })
  } catch (err) {
    if (err instanceof DriveError) return driveErrorResponse(err)
    logger.error('GET /api/documents/[id]/assets/[filename] failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not fetch asset.' }, { status: 500 })
  }
}

/**
 * DELETE /api/documents/[id]/assets/[filename]
 *   → 200 { success: true }
 *   → 404 when the asset is missing (or belongs to another user)
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; filename: string }> },
): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const { id, filename } = await ctx.params
    const decoded = decodeURIComponent(filename)
    const doc = await documentsQ.getById(userId, id)
    if (!doc) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    const asset = await assetsQ.getMeta(userId, id, decoded)
    if (!asset) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    const store = await getAssetStoreForUser(userId)
    const removed = await store.delete(userId, store.refForDocumentAsset(asset))
    if (!removed) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof DriveError) return driveErrorResponse(err)
    logger.error('DELETE /api/documents/[id]/assets/[filename] failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not delete asset.' }, { status: 500 })
  }
}
