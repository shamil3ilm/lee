import { NextResponse } from 'next/server'
import { withAiUsage } from '@/lib/ai/usage'
import { z } from 'zod'
import { scoreCv } from '@/lib/cv-score/score'
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
 * v12.0 — POST /api/cv-score
 * Body: `{documentId, applicationId?, includeAi?}` → scores a stored CV
 * (master / tailored / LaTeX), optionally against an application's job,
 * persists the run and returns the full CvScoreResult.
 */
const bodySchema = z.object({
  documentId: idSchema,
  applicationId: idSchema.nullish(),
  includeAi: z.boolean().optional(),
})

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const userId = await sessionUserId()
    if (!userId) return unauthorized()
    const parsed = bodySchema.safeParse(await readJson(req))
    if (!parsed.success) return badRequest('Provide a valid documentId.')
    const { documentId, applicationId, includeAi } = parsed.data
    const ai = applicationId && includeAi !== false ? await aiForUser(userId) : null
    const { result, usage } = await withAiUsage({ userId }, () =>
      scoreCv({
        userId,
        source: { documentId },
        applicationId: applicationId ?? null,
        ai,
        includeAi: includeAi ?? true,
      }),
    )
    return NextResponse.json({ result: { ...result, usage } })
  } catch (err) {
    return errorResponse(err, 'cv_score_failed', 'Could not score this CV.')
  }
}
