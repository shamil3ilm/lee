import { NextResponse } from 'next/server'
import { withAiUsage } from '@/lib/ai/usage'
import { z } from 'zod'
import { previewAutofix } from '@/lib/cv-score/autofix'
import {
  aiForUser,
  badRequest,
  errorResponse,
  idSchema,
  readJson,
  sessionUserId,
  unauthorized,
} from '@/lib/cv-score/http'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * v12.0 — POST /api/cv-score/autofix/preview
 * Body: `{applicationId?, findingIds?}` → proposed master-CV changes as a
 * structured diff. Nothing is saved.
 */
const bodySchema = z.object({
  applicationId: idSchema.nullish(),
  findingIds: z.array(z.string().min(1).max(64)).max(50).optional(),
})

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const userId = await sessionUserId()
    if (!userId) return unauthorized()
    const parsed = bodySchema.safeParse(await readJson(req))
    if (!parsed.success) return badRequest()
    const ai = await aiForUser(userId)
    const { result: preview, usage } = await withAiUsage({ userId }, () =>
      previewAutofix({
        userId,
        applicationId: parsed.data.applicationId ?? null,
        findingIds: parsed.data.findingIds,
        ai,
      }),
    )
    return NextResponse.json({ preview, usage })
  } catch (err) {
    return errorResponse(err, 'cv_score_autofix_preview_failed', 'Could not prepare fixes.')
  }
}
