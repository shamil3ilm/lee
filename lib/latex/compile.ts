import { logger } from '@/lib/logger'
import { fetchWithTimeout, isTimeoutError, LATEX_COMPILE_TIMEOUT_MS } from '@/lib/net/timeout'
import { createTar, TarNameError } from './tar'

export type CompileResult =
  | { ok: true; pdf: ArrayBuffer }
  | { ok: false; status: number; log: string }

export interface CompileAsset {
  /** Filename as it will be referenced from the .tex source. */
  filename: string
  mimeType: string
  bytes: Buffer
}

export interface CompileOptions {
  source: string
  /**
   * Optional assets packed alongside main.tex. Everything lands in the same
   * working directory, so `\includegraphics{name}` resolves without a
   * subdirectory prefix.
   */
  assets?: readonly CompileAsset[]
}

const LATEX_ONLINE_URL = 'https://latexonline.cc/data?target=main.tex&command=pdflatex'
const MAX_LOG_CHARS = 20_000

/**
 * Compile a full .tex source into PDF bytes via the public latexonline.cc
 * service. The service only accepts a tarball upload (a loose .tex gets
 * "failed to extract tarball"), so main.tex and every asset are packed into
 * one ustar archive sent as the multipart `file` field.
 *
 * On non-2xx response, returns the response body as the LaTeX log so the
 * editor can surface it inline. Truncated to 20KB to keep the payload sane.
 *
 * Backwards compatible: the signature also accepts a bare source string.
 */
export async function compileLatex(
  input: string | CompileOptions,
): Promise<CompileResult> {
  const opts: CompileOptions =
    typeof input === 'string' ? { source: input } : input
  let tar: Uint8Array<ArrayBuffer>
  try {
    tar = createTar([
      { name: 'main.tex', bytes: new TextEncoder().encode(opts.source) },
      ...(opts.assets ?? []).map((a) => ({ name: a.filename, bytes: new Uint8Array(a.bytes) })),
    ])
  } catch (err) {
    if (err instanceof TarNameError) return { ok: false, status: 422, log: err.message }
    throw err
  }
  const form = new FormData()
  form.append('file', new Blob([tar], { type: 'application/x-tar' }), 'bundle.tar')
  let res: Response
  try {
    res = await fetchWithTimeout(
      LATEX_ONLINE_URL,
      { method: 'POST', body: form },
      { timeoutMs: LATEX_COMPILE_TIMEOUT_MS, label: 'latexonline.cc compile' },
    )
  } catch (err) {
    if (isTimeoutError(err)) {
      logger.error('latexonline.cc timeout', { timeoutMs: LATEX_COMPILE_TIMEOUT_MS })
      return {
        ok: false,
        status: 504,
        log: `Compile service unavailable: ${err instanceof Error ? err.message : 'timed out'}`,
      }
    }
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
