import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { DOCX_MIME } from './build'
import type { DocxFile } from './service'

/**
 * Shared by the .docx routes: a download response (ASCII fallback name plus
 * the UTF-8 one), and the error mapping (known export errors keep their own
 * message; anything else is logged and answered generically).
 */

export function docxResponse(file: DocxFile): Response {
  const ascii = file.filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'")
  return new Response(new Uint8Array(file.bytes), {
    status: 200,
    headers: {
      'content-type': DOCX_MIME,
      'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      'content-length': String(file.bytes.byteLength),
      'cache-control': 'private, no-store',
    },
  })
}

export function docxErrorResponse(err: unknown, route: string): Response {
  if (err instanceof Error && err.name === 'DocxExportError' && 'status' in err) {
    return NextResponse.json({ error: err.message }, { status: (err as Error & { status: number }).status })
  }
  logger.error(`GET ${route} failed`, { err: err instanceof Error ? err.message : String(err) })
  return NextResponse.json({ error: 'Could not make the Word file.' }, { status: 500 })
}
