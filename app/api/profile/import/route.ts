import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { importProfile } from '@/lib/profile/importer'
import { getAIProvider } from '@/lib/ai'
import { logger } from '@/lib/logger'

// Regular route handler for file uploads. Server Actions re-encode FormData
// through a closure protocol that strips file bytes; a plain POST endpoint
// receives multipart bodies verbatim. Client POSTs with `fetch` + FormData.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  const bytes = new Uint8Array(await file.arrayBuffer())

  if (name.endsWith('.pdf')) {
    const { extractText, getDocumentProxy } = await import('unpdf')
    const doc = await getDocumentProxy(bytes)
    const { text } = await extractText(doc, { mergePages: true })
    return Array.isArray(text) ? text.join('\n') : (text as string)
  }
  if (name.endsWith('.docx')) {
    const mod = await import('mammoth')
    const result = await mod.extractRawText({ buffer: Buffer.from(bytes) })
    return result.value
  }
  return new TextDecoder('utf-8').decode(bytes)
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    // Route handlers can't call redirect(); do the auth check inline and
    // return a JSON 401 so the client-side toast can show the reason.
    const session = await auth()
    const userId = session?.user?.id
    if (!userId) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
    }
    const formData = await req.formData()

    const cvFile = formData.get('cv')
    const mdFile = formData.get('profile_md')

    let cvText: string | undefined
    let profileMd: string | undefined

    if (cvFile instanceof File && cvFile.size > 0) {
      cvText = await extractTextFromFile(cvFile)
    }
    if (mdFile instanceof File && mdFile.size > 0) {
      profileMd = await extractTextFromFile(mdFile)
    }

    if (!cvText && !profileMd) {
      return NextResponse.json(
        { error: 'Provide a CV or profile markdown file to import.' },
        { status: 400 },
      )
    }

    await importProfile({ userId, cvText, profileMd, ai: getAIProvider() })

    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error('importProfile route failed', {
      err: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Could not import profile.' }, { status: 500 })
  }
}
