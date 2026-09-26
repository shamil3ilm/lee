import { NextResponse } from 'next/server'
import { z } from 'zod'
import { MAX_ASSET_BYTES } from '@/lib/db/queries/documentAssets'
import { assetRouteError, ownedDocument, sameOrigin, type RouteContext } from '@/lib/drive/asset-routes'
import { getDriveConnection, usesDrive } from '@/lib/drive/connection'
import { createAssetUploadSession } from '@/lib/drive/uploads'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const bodySchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().max(200).default('application/octet-stream'),
  size: z.number().int().positive().max(MAX_ASSET_BYTES),
})

/**
 * POST /api/documents/[id]/assets/upload-session
 *   { filename, mimeType, size }
 *   → { mode: 'direct', uploadUrl, uploadId, filename }  browser PUTs to Drive
 *   → { mode: 'server' }  Drive not in use: POST multipart to ../assets
 */
export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  try {
    const owned = await ownedDocument(ctx)
    if (owned instanceof NextResponse) return owned
    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Files must be between 1 byte and 5 MB.' }, { status: 400 })
    }
    const origin = sameOrigin(req)
    const conn = await getDriveConnection(owned.userId)
    if (!usesDrive(conn) || !origin) return NextResponse.json({ mode: 'server' })
    const session = await createAssetUploadSession({
      userId: owned.userId,
      documentId: owned.documentId,
      filename: parsed.data.filename,
      mimeType: parsed.data.mimeType || 'application/octet-stream',
      sizeBytes: parsed.data.size,
      origin,
    })
    return NextResponse.json({ mode: 'direct', ...session }, { headers: { 'cache-control': 'no-store' } })
  } catch (err) {
    return assetRouteError(err, 'assets upload-session failed', 'Could not start the upload.')
  }
}
