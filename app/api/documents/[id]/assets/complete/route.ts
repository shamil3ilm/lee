import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  assetRouteError,
  driveFileIdSchema,
  ownedDocument,
  type RouteContext,
} from '@/lib/drive/asset-routes'
import { completeAssetUpload } from '@/lib/drive/uploads'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const bodySchema = z.object({ fileId: driveFileIdSchema })

/**
 * POST /api/documents/[id]/assets/complete  { fileId } → { asset }
 * Registers a file the browser uploaded straight to Drive, after re-reading
 * its metadata from Drive (folder, tags, size, sha256).
 */
export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  try {
    const owned = await ownedDocument(ctx)
    if (owned instanceof NextResponse) return owned
    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 })
    const asset = await completeAssetUpload({ ...owned, fileId: parsed.data.fileId })
    return NextResponse.json({ asset })
  } catch (err) {
    return assetRouteError(err, 'assets complete failed', 'Could not finish the upload.')
  }
}
