import { NextResponse } from 'next/server'
import { DriveError, driveErrorResponse } from '@/lib/drive/errors'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import * as documentsQ from '@/lib/db/queries/documents'
import { truncateLog } from '@/lib/latex/compile'
import { compileDocumentPdf } from '@/lib/latex/pdf-cache'
import { latexDocumentContentSchema } from '@/lib/documents/types'
import {
  COMPILE_NOTES_HEADER,
  COMPILE_SERVICE_HEADER,
  compileSettingsSchema,
  encodeNotesHeader,
  readCompileSettings,
} from '@/lib/latex/compile-settings'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Room for the primary compile plus the full-TeX-Live fallback (lib/latex/fallback.ts).
export const maxDuration = 60

const bodySchema = z.object({
  documentId: z.string().min(1),
  source: z.string().min(1),
  /** Draft mode: graphicx `draft` for a fast preview (never cached). */
  draft: z.boolean().optional(),
  /** Compile service + engine; saved on the document. Omitted = keep the saved choice. */
  settings: compileSettingsSchema.optional(),
  /** "Clear cache and recompile": skip the compiled-PDF cache. */
  fresh: z.boolean().optional(),
})

/**
 * POST /api/latex/compile
 *   body: { documentId, source, draft?, settings?, fresh? }
 *
 * On success: streams the compiled PDF bytes back (application/pdf) and
 * updates the document row's `compiledAt` + clears any prior error. The
 * x-lee-compile-service / x-lee-compile-notes headers say which service
 * compiled it (e.g. the full-TeX-Live fallback) and why. A PDF compiled
 * anyway despite errors (Stop on first error off) comes back as 200 JSON
 * `{ pdfBase64, log, notes, service }` so the editor shows both.
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
    const { documentId, source, draft, fresh } = parsed.data

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
    const existing = latexDocumentContentSchema.safeParse(doc.content)
    const settings = parsed.data.settings ?? readCompileSettings(existing.success ? existing.data.compileSettings : undefined)
    const started = Date.now()
    const result = await compileDocumentPdf({ userId, documentId, source, draft: draft === true, settings, fresh: fresh === true })
    // Outcome only (never the source or the log): shown in Settings › Logs.
    logger.info('latex_compile', {
      userId,
      documentId,
      ok: result.ok,
      status: result.ok ? 200 : result.status,
      cached: result.ok && 'cached' in result && result.cached === true,
      draft: draft === true,
      service: result.service ?? null,
      fallback: result.service === 'ytotech' && settings.service === 'auto',
      settings: `${settings.service}/${settings.engine}`,
      durationMs: Date.now() - started,
    })
    // Preserve existing content shape then overlay the new source + compile
    // status. If content isn't a valid latex shape (edge case: schema drift)
    // we fall back to a minimal shape rather than crashing.
    const base = { ...(existing.success ? existing.data : { source }), compileSettings: settings }

    if (result.ok) {
      const updated = {
        ...base,
        source,
        compiledAt: new Date().toISOString(),
        compileError: undefined,
        compileLog: undefined,
      }
      await documentsQ.update(userId, documentId, { content: updated })
      if (result.log) {
        return NextResponse.json(
          {
            pdfBase64: result.pdf.toString('base64'),
            log: truncateLog(result.log),
            notes: result.notes,
            service: result.service ?? null,
          },
          { headers: { 'cache-control': 'no-store' } },
        )
      }
      return new Response(new Uint8Array(result.pdf), {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'cache-control': 'no-store',
          ...(result.service ? { [COMPILE_SERVICE_HEADER]: result.service } : {}),
          ...(result.notes.length > 0 ? { [COMPILE_NOTES_HEADER]: encodeNotesHeader(result.notes) } : {}),
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
    return NextResponse.json(
      { error: 'Compile failed', log, notes: result.notes, service: result.service ?? null },
      { status: 422 },
    )
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
