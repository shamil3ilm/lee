import { compileWithFallback } from './fallback'
import { MAX_LOG_CHARS, type CompileOptions, type CompileResult } from './compile-types'

export type { CompileAsset, CompileOptions, CompileResult } from './compile-types'

/**
 * Compile a full .tex source into PDF bytes. latexonline.cc is the primary
 * service; with the default settings (service 'auto') a compile that fails
 * on a missing package, class or font, or while the primary is down, is
 * retried on YtoTech's full TeX Live (lib/latex/fallback.ts). The result
 * names the service that produced it and carries user-facing notes.
 *
 * On failure the LaTeX log comes back (capped at 20KB) so the editor can
 * surface it inline. Backwards compatible: also accepts a bare source string.
 */
export async function compileLatex(input: string | CompileOptions): Promise<CompileResult> {
  const opts: CompileOptions = typeof input === 'string' ? { source: input } : input
  return compileWithFallback(opts)
}

export function truncateLog(input: string): string {
  return input.slice(0, MAX_LOG_CHARS)
}
