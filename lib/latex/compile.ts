import { logger } from '@/lib/logger'

export type CompileResult =
  | { ok: true; pdf: ArrayBuffer }
  | { ok: false; status: number; log: string }

const LATEX_ONLINE_URL = 'https://latexonline.cc/data?target=main.tex&command=pdflatex'
const MAX_LOG_CHARS = 20_000

/**
 * Compile a full .tex source into PDF bytes via the public latexonline.cc
 * service. Uploads the source as multipart form-data (field name `file`).
 *
 * On non-2xx response, returns the response body as the LaTeX log so the
 * editor can surface it inline. Truncated to 20KB to keep the payload sane.
 */
export async function compileLatex(source: string): Promise<CompileResult> {
  const form = new FormData()
  form.append(
    'file',
    new Blob([source], { type: 'application/x-tex' }),
    'main.tex',
  )
  let res: Response
  try {
    res = await fetch(LATEX_ONLINE_URL, { method: 'POST', body: form })
  } catch (err) {
    logger.error('latexonline.cc network error', {
      err: err instanceof Error ? err.message : String(err),
    })
    return {
      ok: false,
      status: 502,
      log: `Compile service unreachable: ${err instanceof Error ? err.message : String(err)}`.slice(
        0,
        MAX_LOG_CHARS,
      ),
    }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return {
      ok: false,
      status: res.status,
      log: text.slice(0, MAX_LOG_CHARS),
    }
  }
  const pdf = await res.arrayBuffer()
  return { ok: true, pdf }
}

export function truncateLog(input: string): string {
  return input.slice(0, MAX_LOG_CHARS)
}
