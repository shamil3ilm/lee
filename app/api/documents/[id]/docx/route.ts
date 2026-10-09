import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isUuid } from '@/lib/logs/redact'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** A master or tailored CV document as an ATS-friendly Word file. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const { id } = await ctx.params
  if (!isUuid(id)) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  // The writer loads only when a Word file is asked for.
  const [{ documentDocx }, { docxErrorResponse, docxResponse }] = await Promise.all([
    import('@/lib/docx/service'),
    import('@/lib/docx/response'),
  ])
  try {
    return docxResponse(await documentDocx(userId, id))
  } catch (err) {
    return docxErrorResponse(err, '/api/documents/[id]/docx')
  }
}
