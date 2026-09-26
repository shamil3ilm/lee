import { NextResponse } from 'next/server'
import { withAiUsage } from '@/lib/ai/usage'
import { z } from 'zod'
import { batchScoreMaster } from '@/lib/cv-score/compare'
import {
  aiForUser,
  badRequest,
  errorResponse,
  readJson,
  sessionUserId,
  unauthorized,
} from '@/lib/cv-score/http'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * v12.0 — POST /api/cv-score/batch
 * Body: `{includeAi?}` (default false — deterministic dimensions only, fast
 * and free). Scores the latest master CV against every active application
 * and returns rows sorted by Total Match.
 */
const bodySchema = z.object({ includeAi: z.boolean().optional() }).nullish()

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const userId = await sessionUserId()
    if (!userId) return unauthorized()
    const parsed = bodySchema.safeParse(await readJson(req))
    if (!parsed.success) return badRequest()
    const includeAi = parsed.data?.includeAi ?? false
    const ai = includeAi ? await aiForUser(userId) : null
    const { result: batch, usage } = await withAiUsage({ userId }, () =>
      batchScoreMaster({ userId, ai, includeAi }),
    )
    return NextResponse.json({ batch, usage })
  } catch (err) {
    return errorResponse(err, 'cv_score_batch_failed', 'Could not run batch scoring.')
  }
}
