import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import * as documentsQ from '@/lib/db/queries/documents'
import * as assetsQ from '@/lib/db/queries/documentAssets'
import { renderCvPdf, renderCoverLetterPdf, renderPrepPackPdf } from '@/lib/pdf/render'
import {
  coverLetterSchema,
  interviewPrepPackSchema,
  latexDocumentContentSchema,
  masterCvSchema,
  outreachDraftSchema,
  tailoredCvSchema,
  type CoverLetter,
  type InterviewPrepPack,
  type MasterCV,
  type OutreachDraft,
  type TailoredCV,
} from '@/lib/documents/types'
import { getMasterCV } from '@/lib/documents/master'
import { compileLatex, truncateLog } from '@/lib/latex/compile'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

function safeFilename(title: string): string {
  return title
    .replace(/[^a-z0-9\-_. ]/gi, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120) || 'document'
}

export async function GET(
  _req: Request,
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
    // React-PDF pipeline. Recompile on every GET but edge-cache the
    // response for a minute so the iframe preview doesn't hammer the
    // upstream service.
    if (doc.kind === 'latex_cv' || doc.kind === 'latex_cover_letter') {
      const content = latexDocumentContentSchema.parse(doc.content)
      if (!content.source.trim()) {
        return NextResponse.json({ error: 'LaTeX source is empty.' }, { status: 422 })
      }
      // v5.2: bundle every asset owned by this document into the compile
      // request so `\includegraphics{name}` and friends resolve without a
      // second round-trip.
      const assets = await assetsQ.listWithBytes(userId, id)
      const result = await compileLatex({
        source: content.source,
        assets: assets.map((a) => ({
          filename: a.filename,
          mimeType: a.mimeType,
          bytes: a.bytes,
        })),
      })
      if (result.ok) {
        // Best-effort side effect: update compile status. Never let a DB
        // failure block returning the fresh PDF bytes.
        try {
          await documentsQ.update(userId, id, {
            content: {
              ...content,
              compiledAt: new Date().toISOString(),
              compileError: undefined,
              compileLog: undefined,
            },
          })
        } catch (dbErr) {
          logger.error('failed to persist latex compiledAt', {
            err: dbErr instanceof Error ? dbErr.message : String(dbErr),
          })
        }
        const filename = `${safeFilename(doc.title)}.pdf`
        return new Response(new Uint8Array(result.pdf), {
          status: 200,
          headers: {
            'content-type': 'application/pdf',
            'content-disposition': `inline; filename="${filename}"`,
            'cache-control': 'public, max-age=60',
          },
        })
      }
      const log = truncateLog(result.log)
      try {
        await documentsQ.update(userId, id, {
          content: {
            ...content,
            compileError: `Compile failed (status ${result.status})`,
            compileLog: log,
          },
        })
      } catch (dbErr) {
        logger.error('failed to persist latex compileError', {
          err: dbErr instanceof Error ? dbErr.message : String(dbErr),
        })
      }
      return NextResponse.json({ error: 'Compile failed', log }, { status: 422 })
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
