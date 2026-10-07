import { logger } from '@/lib/logger'
import { fetchWithTimeout, isTimeoutError } from '@/lib/net/timeout'
import { createTar, TarNameError } from '../tar'
import { compileCancelled, MAX_LOG_CHARS, readPdf, type BackendRequest, type CompileResult } from '../compile-types'

const LATEX_ONLINE_URL = 'https://latexonline.cc/data'

/** Dev/test config: `LATEX_ONLINE_URL` points lee at a stand-in (the e2e stub); ignored in production. */
export function latexOnlineUrl(): string {
  // Production always uses the real service, so a stray env value can never
  // send documents somewhere else.
  if (process.env.VERCEL_ENV === 'production') return LATEX_ONLINE_URL
  return process.env.LATEX_ONLINE_URL || LATEX_ONLINE_URL
}

/**
 * latexonline.cc: the primary compile service (free, no key). It only
 * accepts a tarball upload (a loose .tex gets "failed to extract tarball"),
 * so main.tex and every asset are packed into one ustar archive sent as the
 * multipart `file` field. Its TeX Live is a trimmed distribution: see
 * docs/latex-compile.md for the packages it lacks (fontawesome5 among them).
 *
 * On a non-2xx response the body is the LaTeX log (`file:line: error: …`).
 */
export async function compileOnLatexOnline(req: BackendRequest): Promise<CompileResult> {
  let tar: Uint8Array<ArrayBuffer>
  try {
    tar = createTar([
      { name: 'main.tex', bytes: new TextEncoder().encode(req.source) },
      ...req.assets.map((a) => ({ name: a.filename, bytes: new Uint8Array(a.bytes) })),
    ])
  } catch (err) {
    if (err instanceof TarNameError) return { ok: false, status: 422, log: err.message, service: 'latexonline' }
    throw err
  }
  const form = new FormData()
  form.append('file', new Blob([tar], { type: 'application/x-tar' }), 'bundle.tar')
  const url = `${latexOnlineUrl()}?target=main.tex&command=${req.engine}`
  let res: Response
  try {
    res = await fetchWithTimeout(
      url,
      { method: 'POST', body: form, signal: req.signal },
      { timeoutMs: req.timeoutMs, label: 'latexonline.cc compile' },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (req.signal?.aborted) return compileCancelled('latexonline')
    if (isTimeoutError(err)) {
      logger.error('latexonline.cc timeout', { timeoutMs: req.timeoutMs })
      return { ok: false, status: 504, log: `Compile service unavailable: ${message}`, service: 'latexonline' }
    }
    logger.error('latexonline.cc network error', { err: message })
    return {
      ok: false,
      status: 502,
      log: `Compile service unreachable: ${message}`.slice(0, MAX_LOG_CHARS),
      service: 'latexonline',
    }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { ok: false, status: res.status, log: text.slice(0, MAX_LOG_CHARS), service: 'latexonline' }
  }
  return readPdf(res, req, 'latexonline')
}
