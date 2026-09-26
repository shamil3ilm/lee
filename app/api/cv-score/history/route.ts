import { NextResponse } from 'next/server'
import * as cvScoresQ from '@/lib/db/queries/cvScores'
import { badRequest, errorResponse, idSchema, sessionUserId, unauthorized } from '@/lib/cv-score/http'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * v12.0 — GET /api/cv-score/history?documentId=…&applicationId=…&limit=…
 * At least one filter is required. Returns compact rows (oldest first) with
 * every headline score for charting.
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const userId = await sessionUserId()
    if (!userId) return unauthorized()
    const url = new URL(req.url)
    const documentId = url.searchParams.get('documentId') || undefined
    const applicationId = url.searchParams.get('applicationId') || undefined
    if (!documentId && !applicationId) return badRequest('Provide documentId or applicationId.')
    if (documentId && !idSchema.safeParse(documentId).success) return badRequest('Invalid documentId.')
    if (applicationId && !idSchema.safeParse(applicationId).success) return badRequest('Invalid applicationId.')
    const limitRaw = Number(url.searchParams.get('limit') ?? 50)
    const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.floor(limitRaw))) : 50
    const rows = await cvScoresQ.history(userId, { documentId, applicationId }, limit)
    const history = rows.map((r) => {
      const scores = (r.scores ?? {}) as Record<string, { score: number | null } | undefined>
      return {
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        documentId: r.documentId,
        applicationId: r.applicationId,
        sourceKind: r.sourceKind,
        sourceLabel: r.sourceLabel,
        mode: r.mode,
        overall: r.overall,
        grade: r.grade,
        scorerVersion: r.scorerVersion,
        driveFileId: r.driveFileId,
        scores: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, v?.score ?? null])),
      }
    })
    return NextResponse.json({ history })
  } catch (err) {
    return errorResponse(err, 'cv_score_history_failed', 'Could not load score history.')
  }
}
