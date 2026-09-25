import { logger } from '@/lib/logger'

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
   * Optional bundle of assets to POST alongside main.tex. latexonline.cc
   * accepts multiple `file` fields; every file lands in the same working
   * directory so `\includegraphics{name}` resolves without a subdirectory
   * prefix.
   */
  assets?: readonly CompileAsset[]
}

const LATEX_ONLINE_URL = 'https://latexonline.cc/data?target=main.tex&command=pdflatex'
const MAX_LOG_CHARS = 20_000

/**
 * Compile a full .tex source into PDF bytes via the public latexonline.cc
 * service. Uploads the source as multipart form-data (field name `file`),
 * optionally alongside additional asset files (also `file` fields — each
 * with its filename set so LaTeX can `\includegraphics{name}` them).
 *
 * On non-2xx response, returns the response body as the LaTeX log so the
 * editor can surface it inline. Truncated to 20KB to keep the payload sane.
 *
 * Backwards compatible: the signature also accepts a bare source string
 * from the existing callers that predate v5.2's asset bundling.
 */
export async function compileLatex(
  input: string | CompileOptions,
): Promise<CompileResult> {
  const opts: CompileOptions =
    typeof input === 'string' ? { source: input } : input
  const form = new FormData()
  form.append(
    'file',
    new Blob([opts.source], { type: 'application/x-tex' }),
    'main.tex',
  )
  for (const asset of opts.assets ?? []) {
    form.append(
      'file',
      new Blob([new Uint8Array(asset.bytes)], { type: asset.mimeType || 'application/octet-stream' }),
      asset.filename,
    )
  }
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
