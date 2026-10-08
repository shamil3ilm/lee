import type { CompileBackend, CompileSettings } from './compile-settings'

export type CompileResult =
  | {
      ok: true
      pdf: ArrayBuffer
      service?: CompileBackend
      notes?: string[]
      /** Set when the PDF was compiled anyway despite errors: the error log. */
      log?: string
    }
  | { ok: false; status: number; log: string; service?: CompileBackend; notes?: string[] }

export interface CompileAsset {
  /** Path as it will be referenced from the .tex source ('logo.png', 'figures/logo.png'). */
  filename: string
  mimeType: string
  bytes: Buffer
}

export interface CompileOptions {
  source: string
  /**
   * Optional assets packed alongside main.tex, each at its path from the
   * working directory (main.tex's folder), so `\includegraphics{name}` and
   * `\input{sections/intro}` resolve as in Overleaf.
   */
  assets?: readonly CompileAsset[]
  /** Service + engine; defaults to auto + pdflatex. */
  settings?: CompileSettings
  /** The caller gave up (client disconnected): stop, try nothing else. */
  signal?: AbortSignal
}

/** One compile attempt on one concrete service. */
export interface BackendRequest {
  source: string
  assets: readonly CompileAsset[]
  engine: CompileSettings['engine']
  timeoutMs: number
  /** Keep going after errors and return whatever PDF results (YtoTech only). */
  force?: boolean
  /** Caller cancellation, merged with the per-attempt timeout. */
  signal?: AbortSignal
}

export type BackendCompile = (req: BackendRequest) => Promise<CompileResult>

export const MAX_LOG_CHARS = 20_000

/** Status for a compile the caller cancelled (nginx's "client closed request"). */
export const COMPILE_CANCELLED_STATUS = 499

export function compileCancelled(service: CompileBackend): CompileResult {
  return { ok: false, status: COMPILE_CANCELLED_STATUS, log: 'Compile cancelled.', service }
}

/**
 * Read a PDF body. The attempt's timeout also bounds the body, so a service
 * that sends headers and then stalls is "unavailable" (504) like one that
 * never answers, and the fallback still gets its turn.
 */
export async function readPdf(res: Response, req: BackendRequest, service: CompileBackend): Promise<CompileResult> {
  try {
    return { ok: true, pdf: await res.arrayBuffer(), service }
  } catch (err) {
    if (req.signal?.aborted) return compileCancelled(service)
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, status: 504, log: `Compile service stalled while sending the PDF: ${message}`.slice(0, MAX_LOG_CHARS), service }
  }
}

/**
 * Cap a log at 20KB. TeX prints the fatal error at the END of its log, so a
 * long log keeps its tail (from a line start), not its head.
 */
export function tailLog(input: string): string {
  if (input.length <= MAX_LOG_CHARS) return input
  const tail = input.slice(-MAX_LOG_CHARS)
  const nl = tail.indexOf('\n')
  return nl > 0 && nl < 200 ? tail.slice(nl + 1) : tail
}

/** Status codes that mean "the service, not the document, failed". */
export function isServiceUnavailable(status: number): boolean {
  return status === 429 || status >= 500
}
