import { NextResponse } from 'next/server'
import { DriveError, driveErrorResponse } from '@/lib/drive/errors'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import * as documentsQ from '@/lib/db/queries/documents'
import { truncateLog } from '@/lib/latex/compile'
import { compileDocumentPdf } from '@/lib/latex/pdf-cache'
import { latexDocumentContentSchema } from '@/lib/documents/types'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const bodySchema = z.object({
  documentId: z.string().min(1),
  source: z.string().min(1),
  /** Draft mode: graphicx `draft` for a fast preview (never cached). */
  draft: z.boolean().optional(),
})

/**
 * POST /api/latex/compile
 *   body: { documentId, source, draft? }
 *
 * On success: streams the compiled PDF bytes back (application/pdf) and
 * updates the document row's `compiledAt` + clears any prior error.
 *
 * On failure: returns 422 JSON `{error, log}` and stores the log/error on
 * the document row so the editor can display it after a page reload.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

    const raw = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }
    const { documentId, source, draft } = parsed.data

    const doc = await documentsQ.getById(userId, documentId)
    if (!doc) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    if (doc.kind !== 'latex_cv' && doc.kind !== 'latex_cover_letter') {
      return NextResponse.json({ error: 'Document is not a LaTeX document.' }, { status: 400 })
    }

    // Bundles every asset of the document with the source (latexonline.cc
    // drops all `file` fields into one working dir) — or, when this exact
    // source + asset set was compiled before, serves the cached PDF and
    // skips the compile service entirely. A success also primes the cache
    // for the document's PDF view route.
    // The saved source never carries the draft option; only the compile does.
    const result = await compileDocumentPdf({ userId, documentId, source, draft: draft === true })
    // Preserve existing content shape then overlay the new source + compile
    // status. If content isn't a valid latex shape (edge case: schema drift)
    // we fall back to a minimal shape rather than crashing.
    const existing = latexDocumentContentSchema.safeParse(doc.content)
    const base = existing.success ? existing.data : { source }

    if (result.ok) {
      const updated = {
        ...base,
        source,
        compiledAt: new Date().toISOString(),
        compileError: undefined,
        compileLog: undefined,
      }
      await documentsQ.update(userId, documentId, { content: updated })
      return new Response(new Uint8Array(result.pdf), {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'cache-control': 'no-store',
        },
      })
    }

    const log = truncateLog(result.log)
    const updated = {
      ...base,
      source,
      compileError: `Compile failed (status ${result.status})`,
      compileLog: log,
    }
    await documentsQ.update(userId, documentId, { content: updated })
    return NextResponse.json({ error: 'Compile failed', log }, { status: 422 })
  } catch (err) {
    // Drive-held assets: a revoked grant etc. gets its friendly message.
    if (err instanceof DriveError) return driveErrorResponse(err)
    logger.error('POST /api/latex/compile failed', {
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
    return NextResponse.json({ error: 'Could not compile LaTeX.' }, { status: 500 })
  }
}
