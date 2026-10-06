import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import * as assetsQ from '@/lib/db/queries/documentAssets'
import { DriveError, driveErrorResponse } from '@/lib/drive/errors'
import { logger } from '@/lib/logger'
import { PHOTO_MAX_BYTES } from '@/lib/resume/photo'
import { getProfilePhoto, PhotoError, readProfilePhoto, removeProfilePhoto, saveProfilePhoto } from '@/lib/resume/photo-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * The profile photo (Settings › Profile › Résumé). Private: served only to
 * its owner, never published. Stored through the document-asset store
 * (Drive when connected, else Postgres) — see lib/resume/photo-store.ts.
 *
 *   GET    → the image (private cache)
 *   POST   multipart `file` (already square-cropped in the browser) → { photo }
 *   DELETE → { removed }
 */

async function userId(): Promise<string | null> {
  const session = await auth()
  return session?.user?.id ?? null
}

function failure(err: unknown, event: string, fallback: string): NextResponse {
  if (err instanceof PhotoError || err instanceof assetsQ.AssetValidationError) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
  if (err instanceof DriveError) return driveErrorResponse(err)
  logger.error(event, { err: err instanceof Error ? err.message : String(err) })
  return NextResponse.json({ error: fallback }, { status: 500 })
}

export async function GET(): Promise<Response> {
  try {
    const id = await userId()
    if (!id) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const photo = await getProfilePhoto(id)
    const bytes = photo ? await readProfilePhoto(id, photo) : null
    if (!photo || !bytes) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'content-type': photo.mimeType,
        'content-length': String(bytes.byteLength),
        'cache-control': 'private, max-age=3600',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch (err) {
    return failure(err, 'GET /api/profile/photo failed', 'Could not load the photo.')
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const id = await userId()
    if (!id) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const declared = Number(req.headers.get('content-length') ?? 0)
    // The multipart envelope adds a little; anything far beyond the cap is refused unread.
    if (declared > PHOTO_MAX_BYTES + 64 * 1024) return NextResponse.json({ error: 'The photo is larger than 2 MB.' }, { status: 413 })
    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 })
    }
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'No photo uploaded.' }, { status: 400 })
    if (file.size > PHOTO_MAX_BYTES) return NextResponse.json({ error: 'The photo is larger than 2 MB.' }, { status: 413 })
    const photo = await saveProfilePhoto(id, Buffer.from(await file.arrayBuffer()))
    return NextResponse.json({ photo: { mimeType: photo.mimeType, sha256: photo.sha256 } })
  } catch (err) {
    return failure(err, 'POST /api/profile/photo failed', 'Could not save the photo.')
  }
}

export async function DELETE(): Promise<NextResponse> {
  try {
    const id = await userId()
    if (!id) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    return NextResponse.json({ removed: await removeProfilePhoto(id) })
  } catch (err) {
    return failure(err, 'DELETE /api/profile/photo failed', 'Could not remove the photo.')
  }
}
