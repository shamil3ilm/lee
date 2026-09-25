import { NextResponse } from 'next/server'
import { z } from 'zod'
import { applyAutofix } from '@/lib/cv-score/autofix'
import {
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
 * v12.0 — POST /api/cv-score/autofix/apply
 * Body: `{baseDocumentId, changes}` (changes from a preview, possibly a
 * subset). Every change is re-validated against the CURRENT master CV
 * before a new master version is saved.
 */
const changeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('rewrite_bullet'),
    findingId: z.string().max(64),
    path: z.string().max(64),
    roleIndex: z.number().int().min(0).max(100),
    bulletIndex: z.number().int().min(0).max(100),
    before: z.string().max(2000),
    after: z.string().min(1).max(2000),
  }),
  z.object({
    kind: z.literal('add_skill'),
    findingId: z.string().max(64),
    path: z.literal('skills.secondary'),
    term: z.string().min(1).max(60),
    before: z.null(),
    after: z.string().min(1).max(60),
  }),
])

const bodySchema = z.object({
  baseDocumentId: idSchema,
  changes: z.array(changeSchema).min(1).max(50),
})

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const userId = await sessionUserId()
    if (!userId) return unauthorized()
    const parsed = bodySchema.safeParse(await readJson(req))
    if (!parsed.success) return badRequest('Invalid changes.')
    const applied = await applyAutofix({ userId, ...parsed.data })
    return NextResponse.json({ applied })
  } catch (err) {
    return errorResponse(err, 'cv_score_autofix_apply_failed', 'Could not apply fixes.')
  }
}
