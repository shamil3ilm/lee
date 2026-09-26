import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import * as documentsQ from '@/lib/db/queries/documents'
import {
  renderCvPdf,
  renderCoverLetterPdf,
  renderDebriefPdf,
  renderPrepPackPdf,
} from '@/lib/pdf/render'
import { mergePdfs, type MergeSource } from '@/lib/documents/merge'
import {
  coverLetterSchema,
  interviewDebriefSchema,
  interviewPrepPackSchema,
  latexDocumentContentSchema,
  masterCvSchema,
  outreachDraftSchema,
  tailoredCvSchema,
  type CoverLetter,
  type InterviewDebrief,
  type InterviewPrepPack,
  type MasterCV,
  type OutreachDraft,
  type TailoredCV,
} from '@/lib/documents/types'
import { getMasterCV } from '@/lib/documents/master'
import { truncateLog } from '@/lib/latex/compile'
import { compileDocumentPdf, documentCacheKey } from '@/lib/latex/pdf-cache'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const LATEX_CACHE_CONTROL = 'private, max-age=60'

/** True when an If-None-Match header lists `etag` (or `*`). */
function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false
  return header.split(',').some((t) => {
    const v = t.trim().replace(/^W\//, '')
    return v === etag || v === '*'
  })
}

async function latexPdfResponse(
  req: Request,
  userId: string,
  id: string,
  title: string,
  rawContent: unknown,
): Promise<Response> {
  const content = latexDocumentContentSchema.parse(rawContent)
  if (!content.source.trim()) {
    return NextResponse.json({ error: 'LaTeX source is empty.' }, { status: 422 })
  }

  // The key is computed from metadata only, so a revalidation that matches
  // the browser's copy costs one small query and no bytes.
  const { cacheKey } = await documentCacheKey(userId, id, content.source)
  const etag = `"${cacheKey}"`
  if (etagMatches(req.headers.get('if-none-match'), etag)) {
    return new Response(null, {
      status: 304,
      headers: { etag, 'cache-control': LATEX_CACHE_CONTROL },
    })
  }

  const result = await compileDocumentPdf({ userId, documentId: id, source: content.source })
  if (result.ok) {
    // Only clear a stale error; never rewrite the row just because it was viewed.
    if (content.compileError !== undefined || content.compileLog !== undefined) {
      await persistCompileStatus(userId, id, {
        ...content,
        compileError: undefined,
        compileLog: undefined,
      })
    }
    return new Response(new Uint8Array(result.pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${safeFilename(title)}.pdf"`,
        'content-length': String(result.pdf.byteLength),
        'cache-control': LATEX_CACHE_CONTROL,
        etag: `"${result.cacheKey}"`,
      },
    })
  }

  const log = truncateLog(result.log)
  const compileError = `Compile failed (status ${result.status})`
  if (content.compileError !== compileError || content.compileLog !== log) {
    await persistCompileStatus(userId, id, { ...content, compileError, compileLog: log })
  }
  return NextResponse.json({ error: 'Compile failed', log }, { status: 422 })
}

/** Best effort: a DB failure must never block returning the PDF / error. */
async function persistCompileStatus(userId: string, id: string, content: unknown): Promise<void> {
  try {
    await documentsQ.update(userId, id, { content })
  } catch (dbErr) {
    logger.error('failed to persist latex compile status', {
      err: dbErr instanceof Error ? dbErr.message : String(dbErr),
    })
  }
}

function safeFilename(title: string): string {
  return title
    .replace(/[^a-z0-9\-_. ]/gi, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120) || 'document'
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    const { id } = await ctx.params
    const doc = await documentsQ.getById(userId, id)
    if (!doc) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

    // LaTeX documents route through the compile service instead of the
    // React-PDF pipeline, behind a compiled-PDF cache keyed by the source +
    // asset hashes (lib/latex/pdf-cache.ts). A view never rewrites the
    // document row unless the stored compile error actually changes.
    if (doc.kind === 'latex_cv' || doc.kind === 'latex_cover_letter') {
      return latexPdfResponse(req, userId, id, doc.title, doc.content)
    }

    // Outreach kinds are short-form text — serve as .txt (no PDF template).
    if (
      doc.kind === 'outreach_linkedin_connection' ||
      doc.kind === 'outreach_linkedin_message' ||
      doc.kind === 'outreach_recruiter_reply'
    ) {
      const draft: OutreachDraft = outreachDraftSchema.parse(doc.content)
      const body = draft.subject ? `Subject: ${draft.subject}\n\n${draft.body}` : draft.body
      const filename = `${safeFilename(doc.title)}.txt`
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'content-disposition': `attachment; filename="${filename}"`,
          'cache-control': 'private, no-store',
        },
      })
    }

    // v7 — merged PDFs. Regenerate from the recorded source list on every
    // request; the merged bytes are not cached in the DB.
    if (doc.kind === 'merged_pdf') {
      const content = doc.content as { sourceRefs?: MergeSource[] }
      const refs = Array.isArray(content?.sourceRefs) ? content.sourceRefs : []
      if (refs.length === 0) {
        return NextResponse.json(
          { error: 'Merged document has no source refs.' },
          { status: 422 },
        )
      }
      const merged = await mergePdfs({ userId, sources: refs })
      const filename = `${safeFilename(doc.title)}.pdf`
      return new Response(new Uint8Array(merged), {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': `attachment; filename="${filename}"`,
          'content-length': String(merged.byteLength),
          'cache-control': 'private, no-store',
        },
      })
    }

    let buffer: Buffer
    if (doc.kind === 'master_cv') {
      const cv: MasterCV = masterCvSchema.parse(doc.content)
      buffer = await renderCvPdf(cv)
    } else if (doc.kind === 'tailored_cv') {
      const cv: TailoredCV = tailoredCvSchema.parse(doc.content)
      buffer = await renderCvPdf(cv)
    } else if (doc.kind === 'cover_letter') {
      const letter: CoverLetter = coverLetterSchema.parse(doc.content)
      // Enrich the cover-letter letterhead with contact info from the current
      // master CV so the sender block matches the CV.
      const master = await getMasterCV(userId)
      buffer = await renderCoverLetterPdf(
        letter,
        master ? { ...master.basics } : { name: letter.senderName },
      )
    } else if (doc.kind === 'interview_prep_pack') {
      const pack: InterviewPrepPack = interviewPrepPackSchema.parse(doc.content)
      buffer = await renderPrepPackPdf(pack)
    } else if (doc.kind === 'interview_debrief') {
      const debrief: InterviewDebrief = interviewDebriefSchema.parse(doc.content)
      buffer = await renderDebriefPdf(debrief)
    } else {
      return NextResponse.json({ error: `Unsupported document kind: ${doc.kind}` }, { status: 400 })
    }

    const filename = `${safeFilename(doc.title)}.pdf`
    // Convert Buffer → Uint8Array to satisfy the Response body type across
    // Node's http and the Web streams API used by Next 16.
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${filename}"`,
        'content-length': String(buffer.byteLength),
        'cache-control': 'private, no-store',
      },
    })
  } catch (err) {
    logger.error('GET /api/documents/[id]/pdf failed', {
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
    return NextResponse.json({ error: 'Could not render PDF.' }, { status: 500 })
  }
}
