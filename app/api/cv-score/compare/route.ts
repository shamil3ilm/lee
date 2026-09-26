import { NextResponse } from 'next/server'
import { withAiUsage } from '@/lib/ai/usage'
import { z } from 'zod'
import { compareCvs } from '@/lib/cv-score/compare'
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
 * v12.0 — POST /api/cv-score/compare
 * Body: `{documentIdA, documentIdB, applicationId?, includeAi?}` → both
 * results + per-headline deltas (b − a). Used for the master → tailored
 * "tailoring delta".
 */
const bodySchema = z.object({
  documentIdA: idSchema,
  documentIdB: idSchema,
  applicationId: idSchema.nullish(),
  includeAi: z.boolean().optional(),
})

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const userId = await sessionUserId()
    if (!userId) return unauthorized()
    const parsed = bodySchema.safeParse(await readJson(req))
    if (!parsed.success) return badRequest('Provide two valid document ids.')
    const { documentIdA, documentIdB, applicationId, includeAi } = parsed.data
    const ai = applicationId && includeAi !== false ? await aiForUser(userId) : null
    const { result: comparison, usage } = await withAiUsage({ userId }, () =>
      compareCvs({
        userId,
        documentIdA,
        documentIdB,
        applicationId: applicationId ?? null,
        ai,
        includeAi: includeAi ?? true,
      }),
    )
    return NextResponse.json({ comparison, usage })
  } catch (err) {
    return errorResponse(err, 'cv_score_compare_failed', 'Could not compare these CVs.')
  }
}
