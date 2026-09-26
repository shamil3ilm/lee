import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  assetRouteError,
  driveFileIdSchema,
  ownedDocument,
  type RouteContext,
} from '@/lib/drive/asset-routes'
import { attachPickedFile } from '@/lib/drive/uploads'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const bodySchema = z.object({ fileIds: z.array(driveFileIdSchema).min(1).max(10) })

/**
 * POST /api/documents/[id]/assets/from-drive  { fileIds } → { assets, errors? }
 * "Attach from Drive": files chosen in the Google Picker are referenced in
 * place (no copy). Per-file errors are reported like the upload route.
 */
export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  try {
    const owned = await ownedDocument(ctx)
    if (owned instanceof NextResponse) return owned
    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Pick one to ten files.' }, { status: 400 })
    const assets = []
    const errors: { fileId: string; error: string }[] = []
    for (const fileId of parsed.data.fileIds) {
      try {
        assets.push(await attachPickedFile({ ...owned, fileId }))
      } catch (err) {
        const res = assetRouteError(err, 'assets from-drive item failed', 'Could not attach that file.')
        const body = (await res.json()) as { error: string; connect?: boolean }
        if (body.connect) return NextResponse.json(body, { status: res.status })
        errors.push({ fileId, error: body.error })
      }
    }
    return NextResponse.json({ assets, errors: errors.length ? errors : undefined })
  } catch (err) {
    return assetRouteError(err, 'assets from-drive failed', 'Could not attach from Google Drive.')
  }
}
