import { logger } from '@/lib/logger'
import { fetchWithTimeout, isTimeoutError } from '@/lib/net/timeout'
import { isSafeProjectPath } from '../project/paths'
import { compileCancelled, readPdf, tailLog, type BackendRequest, type CompileResult } from '../compile-types'

const YTOTECH_URL = 'https://latex.ytotech.com/builds/sync'

/** Dev/test config: `LATEX_YTOTECH_URL` points lee at a stand-in (the e2e stub); ignored in production. */
export function ytotechUrl(): string {
  // Production always uses the real service, so a stray env value can never
  // send documents somewhere else.
  if (process.env.VERCEL_ENV === 'production') return YTOTECH_URL
  return process.env.LATEX_YTOTECH_URL || YTOTECH_URL
}
const MAIN_DOC = /__main_document__\.(tex|log)/g

/**
 * YtoTech LaTeX-on-HTTP (latex.ytotech.com): the fallback compile service.
 * Free public instance (open beta, AGPL-3.0 code, no key, no published rate
 * limit) running a full, current TeX Live. Resources travel as JSON: the
 * main file inline, assets base64-encoded.
 *
 * Its defaults keep going after errors (latexmk -f, nonstopmode) and can
 * return a PDF for a broken document; lee asks for halt-on-error without
 * force, so a document fails here exactly when it would fail on
 * latexonline.cc. A failure answers 400 JSON with the full .log, whose
 * internal main-file name is mapped back to main.tex for the log parser.
 */
export async function compileOnYtoTech(req: BackendRequest): Promise<CompileResult> {
  const bad = req.assets.find((a) => !isSafeProjectPath(a.filename) || a.filename === 'main.tex')
  if (bad) return { ok: false, status: 422, log: `Unsupported file name for compile: "${bad.filename}"`, service: 'ytotech' }
  const body = JSON.stringify({
    compiler: req.engine,
    resources: [
      { main: true, path: 'main.tex', content: req.source },
      ...req.assets.map((a) => ({ path: a.filename, file: a.bytes.toString('base64') })),
    ],
    options: {
      compiler: req.force ? { halt_on_error: false, force: true } : { halt_on_error: true, force: false },
      response: { log_files_on_failure: true },
    },
  })
  let res: Response
  try {
    res = await fetchWithTimeout(
      ytotechUrl(),
      { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: req.signal },
      { timeoutMs: req.timeoutMs, label: 'YtoTech compile' },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (req.signal?.aborted) return compileCancelled('ytotech')
    if (isTimeoutError(err)) {
      logger.error('ytotech timeout', { timeoutMs: req.timeoutMs })
      return { ok: false, status: 504, log: `Fallback compile service unavailable: ${message}`, service: 'ytotech' }
    }
    logger.error('ytotech network error', { err: message })
    return { ok: false, status: 502, log: `Fallback compile service unreachable: ${message}`, service: 'ytotech' }
  }
  const type = res.headers.get('content-type') ?? ''
  if (res.ok && type.includes('pdf')) return readPdf(res, req, 'ytotech')
  const text = await res.text().catch(() => '')
  return { ok: false, status: res.ok ? 502 : res.status, log: tailLog(ytotechLog(text)), service: 'ytotech' }
}

interface YtoTechError {
  error?: string
  log_files?: Record<string, string>
  logs?: string
}

/** The TeX .log from a YtoTech error body, else its latexmk output or raw text. */
export function ytotechLog(body: string): string {
  let parsed: YtoTechError | null = null
  try {
    parsed = JSON.parse(body) as YtoTechError
  } catch {
    return body
  }
  if (!parsed || typeof parsed !== 'object') return body
  const files = parsed.log_files ?? {}
  const texLog = Object.entries(files).find(([name]) => name.endsWith('.log'))?.[1]
  const text = texLog ?? parsed.logs ?? parsed.error ?? body
  return text.replace(MAIN_DOC, 'main.$1')
}
