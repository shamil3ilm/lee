import { logger } from '@/lib/logger'
import { LATEX_COMPILE_TIMEOUT_MS } from '@/lib/net/timeout'
import {
  BACKEND_NAMES,
  canCompileAnyway,
  DEFAULT_COMPILE_SETTINGS,
  type CompileBackend,
  type CompileSettings,
} from './compile-settings'
import {
  isServiceUnavailable,
  type BackendCompile,
  type CompileAsset,
  type CompileOptions,
  type CompileResult,
} from './compile-types'
import { hasMissingResources, missingResources, type MissingResources } from './missing'
import { hasShim, SHIM_NOTES, shimAsset } from './shims'
import { compileOnLatexOnline } from './services/latexonline'
import { compileOnYtoTech } from './services/ytotech'

/**
 * Compile with automatic fallback (settings.service = 'auto'):
 *   1. latexonline.cc (primary);
 *   2. on a missing .sty/.cls/font, or when the primary is down, YtoTech's
 *      full TeX Live;
 *   3. if the fallback is down too and a missing package has a bundled
 *      stand-in (lib/latex/shims.ts), the primary again with the stand-in.
 * 'latexonline' runs steps 1 and 3; 'ytotech' runs only that service.
 * With stopOnError off, a document error is compiled again on YtoTech with
 * latexmk -f, returning that PDF together with the first attempt's log.
 * Every attempt shares one time budget that fits the route's maxDuration.
 */

/** Total time for all attempts; the compile routes allow 60 s. */
export const COMPILE_BUDGET_MS = 55_000
const MIN_ATTEMPT_MS = 3_000

export interface FallbackDeps {
  backends: Readonly<Record<CompileBackend, BackendCompile>>
  now: () => number
}

const DEFAULT_DEPS: FallbackDeps = {
  backends: { latexonline: compileOnLatexOnline, ytotech: compileOnYtoTech },
  now: () => Date.now(),
}

function describeMissing(m: MissingResources): string {
  const parts = [
    ...m.packages.map((p) => `package ${p}`),
    ...m.classes.map((c) => `class ${c}`),
    ...m.fonts.map((f) => `font ${f}`),
  ]
  return parts.join(', ')
}

function fallbackReason(first: CompileResult & { ok: false }, missing: MissingResources): string {
  return hasMissingResources(missing)
    ? `${BACKEND_NAMES.latexonline} doesn't have ${describeMissing(missing)}`
    : `${BACKEND_NAMES.latexonline} is unavailable (status ${first.status})`
}

function withNotes(result: CompileResult, notes: readonly string[]): CompileResult {
  return { ...result, notes: [...(result.notes ?? []), ...notes] }
}

export async function compileWithFallback(
  opts: CompileOptions,
  deps: FallbackDeps = DEFAULT_DEPS,
): Promise<CompileResult> {
  const settings = opts.settings ?? DEFAULT_COMPILE_SETTINGS
  const assets = opts.assets ?? []
  const deadline = deps.now() + COMPILE_BUDGET_MS
  const remaining = (): number => deadline - deps.now()
  const run = (backend: CompileBackend, extra: readonly CompileAsset[] = [], force = false): Promise<CompileResult> =>
    deps.backends[backend]({
      source: opts.source,
      assets: [...assets, ...extra],
      engine: settings.engine,
      timeoutMs: Math.max(MIN_ATTEMPT_MS, Math.min(LATEX_COMPILE_TIMEOUT_MS, remaining())),
      ...(force ? { force: true } : {}),
    })
  const result = await runSettings(settings, assets, run, remaining)
  return settings.stopOnError || !canCompileAnyway(settings) ? result : compileAnyway(result, run, remaining)
}

/** "Try to compile anyway": a document error still yields a PDF, with its log. */
async function compileAnyway(
  result: CompileResult,
  run: Runner,
  remaining: () => number,
): Promise<CompileResult> {
  if (result.ok || isServiceUnavailable(result.status) || remaining() < MIN_ATTEMPT_MS) return result
  const forced = await run('ytotech', [], true)
  if (!forced.ok) return result
  return {
    ...forced,
    log: result.log,
    notes: [...(result.notes ?? []), 'Compiled anyway despite errors (Stop on first error is off); fix the errors in the log.'],
  }
}

type Runner = (backend: CompileBackend, extra?: readonly CompileAsset[], force?: boolean) => Promise<CompileResult>

async function runSettings(
  settings: CompileSettings,
  assets: readonly CompileAsset[],
  run: Runner,
  remaining: () => number,
): Promise<CompileResult> {
  if (settings.service === 'ytotech') return withNotes(await run('ytotech'), [])

  const first = await run('latexonline')
  if (first.ok) return withNotes(first, [])
  const missing = missingResources(first.log)
  const notes: string[] = []

  if (settings.service === 'auto' && (hasMissingResources(missing) || isServiceUnavailable(first.status))) {
    const reason = fallbackReason(first, missing)
    const second = await run('ytotech')
    logger.info('latex_compile_fallback', { reason, ok: second.ok, status: second.ok ? 200 : second.status })
    if (second.ok) return withNotes(second, [`${reason}; compiled on ${BACKEND_NAMES.ytotech} instead.`])
    if (!isServiceUnavailable(second.status)) {
      return withNotes(second, [`${reason}; recompiled on ${BACKEND_NAMES.ytotech}, which reported the errors below.`])
    }
    notes.push(`${reason}, and the full TeX Live fallback (${BACKEND_NAMES.ytotech}) is unavailable right now.`)
  }

  const shims = missing.packages
    .filter((p) => hasShim(p) && !assets.some((a) => a.filename === `${p}.sty`))
    .flatMap((p) => {
      const asset = shimAsset(p)
      return asset ? [{ pkg: p, asset }] : []
    })
  if (shims.length > 0 && remaining() >= MIN_ATTEMPT_MS) {
    const third = await run('latexonline', shims.map((s) => s.asset))
    logger.info('latex_compile_shim', { packages: shims.map((s) => s.pkg), ok: third.ok })
    return withNotes(third, [...notes, ...shims.map((s) => SHIM_NOTES[s.pkg]!)])
  }
  return withNotes(first, notes)
}
