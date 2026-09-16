import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import * as documentsQ from '@/lib/db/queries/documents'
import { renderCvPdf, renderCoverLetterPdf } from '@/lib/pdf/render'
import {
  coverLetterSchema,
  masterCvSchema,
  tailoredCvSchema,
  type CoverLetter,
  type MasterCV,
  type TailoredCV,
} from '@/lib/documents/types'
import { getMasterCV } from '@/lib/documents/master'
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
