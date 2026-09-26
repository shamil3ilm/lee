import { NextResponse } from 'next/server'
import { withAiUsage } from '@/lib/ai/usage'
import { saveCvCopyToDrive } from '@/lib/drive/cv-copy'
import { scoreCv } from '@/lib/cv-score/score'
import { MAX_UPLOAD_BYTES } from '@/lib/cv-score/upload'
import {
  aiForUser,
  badRequest,
  errorResponse,
  idSchema,
  sessionUserId,
  unauthorized,
} from '@/lib/cv-score/http'

// Route handler (not a server action): server actions re-encode FormData and
// strip file bytes; a plain POST receives the multipart body verbatim.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * v12.0 — POST /api/cv-score/upload
 * Multipart: `file` (PDF/DOCX/TXT/MD ≤ 5 MB), optional `applicationId`,
 * optional `includeAi` ("false" to skip the AI requirement check),
 * optional `saveToDrive` ("true" to keep a copy in Employ/CVs in the user's
 * Google Drive; off by default, and without it nothing is stored).
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const userId = await sessionUserId()
    if (!userId) return unauthorized()
    const form = await req.formData().catch(() => null)
    if (!form) return badRequest('Expected a multipart form upload.')
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) return badRequest('Attach a CV file.')
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'File is larger than 5 MB.' }, { status: 413 })
    }
    const rawApp = form.get('applicationId')
    let applicationId: string | null = null
    if (typeof rawApp === 'string' && rawApp.trim()) {
      const parsed = idSchema.safeParse(rawApp.trim())
      if (!parsed.success) return badRequest('Invalid applicationId.')
      applicationId = parsed.data
    }
    const includeAi = form.get('includeAi') !== 'false'
    const ai = applicationId && includeAi ? await aiForUser(userId) : null
    const bytes = new Uint8Array(await file.arrayBuffer())
    const { result, usage } = await withAiUsage({ userId }, () =>
      scoreCv({
        userId,
        source: { upload: { name: file.name || 'upload', bytes } },
        applicationId,
        ai,
        includeAi,
      }),
    )
    if (form.get('saveToDrive') !== 'true') {
      return NextResponse.json({ result: { ...result, usage } })
    }
    const driveCopy = await saveCvCopyToDrive({
      userId,
      scoreId: result.id,
      name: file.name || 'cv',
      mimeType: file.type,
      bytes,
    })
    const driveFileId = driveCopy.saved ? driveCopy.driveFileId : null
    return NextResponse.json({ result: { ...result, usage, driveFileId }, driveCopy })
  } catch (err) {
    return errorResponse(err, 'cv_score_upload_failed', 'Could not score the uploaded CV.')
  }
}
