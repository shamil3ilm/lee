import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import * as documentsQ from '@/lib/db/queries/documents'
import * as appsQ from '@/lib/db/queries/applications'
import { mergePdfs, type MergeSource } from '@/lib/documents/merge'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const sourceSchema = z.object({
  kind: z.enum(['document', 'asset']),
  id: z.string().uuid(),
})

const bodySchema = z.object({
  sources: z.array(sourceSchema).min(1).max(30),
  applicationId: z.string().uuid().optional().nullable(),
  title: z.string().min(1).max(200).optional(),
})

/**
 * POST /api/documents/merge
 * Body: { sources: [{kind, id}], applicationId?, title? }
 *   → 201 { documentId, downloadUrl }
 *
 * Materialises the merged PDF once to validate the source list, then
 * records a `merged_pdf` document row containing only the source refs +
 * merged-at timestamp. The bytes themselves are NOT cached; re-download
 * regenerates via the /api/documents/[id]/pdf dispatcher.
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request body.' },
        { status: 400 },
      )
    }

    if (parsed.data.applicationId) {
      const app = await appsQ.getById(userId, parsed.data.applicationId)
      if (!app) return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
    }

    // Merge once up-front so the response fails fast when sources are
    // invalid. The bytes are discarded; the download route regenerates them.
    try {
      await mergePdfs({
        userId,
        sources: parsed.data.sources as MergeSource[],
      })
    } catch (err) {
      logger.error('merge validation failed', {
        err: err instanceof Error ? err.message : String(err),
      })
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? `Could not merge documents: ${err.message}`
              : 'Could not merge documents.',
        },
        { status: 422 },
      )
    }

    const title =
      parsed.data.title?.trim() ||
      `Merged package (${new Date().toISOString().slice(0, 10)})`
    const version = await documentsQ.nextVersion(
      userId,
      parsed.data.applicationId ?? null,
      'merged_pdf',
    )
    const doc = await documentsQ.create(userId, {
      applicationId: parsed.data.applicationId ?? null,
      kind: 'merged_pdf',
      version,
      title,
      content: {
        sourceRefs: parsed.data.sources,
        mergedAt: new Date().toISOString(),
      },
    })
    return NextResponse.json(
      {
        documentId: doc.id,
        downloadUrl: `/api/documents/${doc.id}/pdf`,
      },
      { status: 201 },
    )
  } catch (err) {
    logger.error('POST /api/documents/merge failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not merge documents.' }, { status: 500 })
  }
}
