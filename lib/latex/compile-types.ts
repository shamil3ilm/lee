import type { CompileBackend, CompileSettings } from './compile-settings'

export type CompileResult =
  | { ok: true; pdf: ArrayBuffer; service?: CompileBackend; notes?: string[] }
  | { ok: false; status: number; log: string; service?: CompileBackend; notes?: string[] }

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
  /** Service + engine; defaults to auto + pdflatex. */
  settings?: CompileSettings
}

/** One compile attempt on one concrete service. */
export interface BackendRequest {
  source: string
  assets: readonly CompileAsset[]
  engine: CompileSettings['engine']
  timeoutMs: number
}

export type BackendCompile = (req: BackendRequest) => Promise<CompileResult>

export const MAX_LOG_CHARS = 20_000

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
