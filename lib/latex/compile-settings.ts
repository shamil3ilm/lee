import { z } from 'zod'

/**
 * Per-document compile settings, stored on the LaTeX document's content and
 * chosen in the editor's compile settings. Client-safe (no node imports).
 *
 *   service  auto         latexonline.cc first; on a missing package, class
 *                         or font (or when it is down) retry on YtoTech's
 *                         full TeX Live
 *            latexonline  latexonline.cc only (bundled shims still apply)
 *            ytotech      YtoTech LaTeX-on-HTTP only (full TeX Live)
 *   engine   pdflatex | xelatex | lualatex (fontspec needs XeLaTeX/LuaLaTeX)
 */

export const COMPILE_SERVICES = ['auto', 'latexonline', 'ytotech'] as const
export type CompileService = (typeof COMPILE_SERVICES)[number]
/** A concrete service a compile actually ran on. */
export type CompileBackend = Exclude<CompileService, 'auto'>

export const COMPILE_ENGINES = ['pdflatex', 'xelatex', 'lualatex'] as const
export type CompileEngine = (typeof COMPILE_ENGINES)[number]

export const SERVICE_LABELS: Readonly<Record<CompileService, string>> = {
  auto: 'Automatic',
  latexonline: 'Primary (latexonline.cc)',
  ytotech: 'Full TeX Live (YtoTech)',
}

export const SERVICE_HINTS: Readonly<Record<CompileService, string>> = {
  auto: 'Primary first; full TeX Live when a package is missing or the primary is down',
  latexonline: 'Fast, but lacks some packages (fontawesome5 …)',
  ytotech: 'Every package; a free public beta service',
}

export const BACKEND_NAMES: Readonly<Record<CompileBackend, string>> = {
  latexonline: 'latexonline.cc',
  ytotech: 'YtoTech (full TeX Live)',
}

export const ENGINE_LABELS: Readonly<Record<CompileEngine, string>> = {
  pdflatex: 'pdfLaTeX',
  xelatex: 'XeLaTeX',
  lualatex: 'LuaLaTeX',
}

export const compileSettingsSchema = z.object({
  service: z.enum(COMPILE_SERVICES).default('auto'),
  engine: z.enum(COMPILE_ENGINES).default('pdflatex'),
  /**
   * false = "try to compile anyway": a document error still yields a PDF
   * (YtoTech's latexmk -f) next to the log. latexonline.cc can't do this.
   */
  stopOnError: z.boolean().default(true),
})
export type CompileSettings = z.infer<typeof compileSettingsSchema>

export const DEFAULT_COMPILE_SETTINGS: CompileSettings = { service: 'auto', engine: 'pdflatex', stopOnError: true }

export function isDefaultSettings(s: CompileSettings | undefined): boolean {
  return (
    !s ||
    (s.service === DEFAULT_COMPILE_SETTINGS.service &&
      s.engine === DEFAULT_COMPILE_SETTINGS.engine &&
      s.stopOnError === DEFAULT_COMPILE_SETTINGS.stopOnError)
  )
}

/** "Try to compile anyway" needs a service that can (YtoTech). */
export function canCompileAnyway(s: CompileSettings): boolean {
  return s.service !== 'latexonline'
}

/** Lenient read of a stored value: anything invalid falls back to the defaults. */
export function readCompileSettings(value: unknown): CompileSettings {
  const parsed = compileSettingsSchema.safeParse(value ?? {})
  return parsed.success ? parsed.data : DEFAULT_COMPILE_SETTINGS
}

/** Response headers carrying which service compiled and its notes. */
export const COMPILE_SERVICE_HEADER = 'x-lee-compile-service'
export const COMPILE_NOTES_HEADER = 'x-lee-compile-notes'

export function encodeNotesHeader(notes: readonly string[]): string {
  return encodeURIComponent(JSON.stringify(notes))
}

export function decodeNotesHeader(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(value))
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string').slice(0, 10) : []
  } catch {
    return []
  }
}
