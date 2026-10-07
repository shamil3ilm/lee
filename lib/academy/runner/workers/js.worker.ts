/// <reference lib="webworker" />
import { compileJs, consoleSink, runCase, sinkText, timeCall } from '../js-harness'
import type { FunctionJob, RunJob, RunResult } from '../protocol'
import { emptyResult } from '../protocol'
import { analyzeJs } from '../quality-js'
import { measureScale } from '../scale'
import { jsHeapKb, lockNetwork, post, postCase, serveJobs } from './sandbox'

/**
 * JavaScript / TypeScript runner (Web Worker, never the main thread).
 * TypeScript is transpiled here with the `typescript` package's
 * transpileModule (types are stripped, not checked); it is fetched as a
 * lazy chunk only when a TypeScript job arrives.
 */

type TsModule = typeof import('typescript')
let tsPromise: Promise<TsModule> | null = null

function loadTypeScript(): Promise<TsModule> {
  tsPromise ??= import('typescript').then((m) => ((m as unknown as { default?: TsModule }).default ?? m) as TsModule)
  return tsPromise
}

async function transpile(code: string): Promise<{ ok: true; js: string } | { ok: false; error: string }> {
  const ts = await loadTypeScript()
  const out = ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, sourceMap: false },
    reportDiagnostics: true,
  })
  const first = out.diagnostics?.find((d) => d.category === ts.DiagnosticCategory.Error)
  if (first) {
    const pos = first.file && first.start !== undefined ? first.file.getLineAndCharacterOfPosition(first.start) : null
    const where = pos ? ` (line ${pos.line + 1})` : ''
    return { ok: false, error: `TypeScript: ${ts.flattenDiagnosticMessageText(first.messageText, '\n')}${where}` }
  }
  return { ok: true, js: out.outputText }
}

async function runFunction(job: FunctionJob): Promise<RunResult> {
  let source = job.code
  if (job.language === 'typescript') {
    const t = await transpile(job.code)
    if (!t.ok) return emptyResult(t.error)
    source = t.js
  }
  lockNetwork()
  post({ type: 'ready' })
  const analysis = analyzeJs(source)
  if (!analysis.ok) return emptyResult(analysis.error)
  if (analysis.analysis.forbidden) return emptyResult(analysis.analysis.forbidden)
  const sink = consoleSink()
  const compiled = compileJs(source, job.fnName, sink)
  if (!compiled.ok) return { ...emptyResult(compiled.error), stdout: sinkText(sink) }
  const cases = job.cases.map((args, i) => {
    const outcome = runCase(compiled.fn, args)
    postCase(i, outcome)
    return outcome
  })
  const scale = job.scale
    ? await measureScale(job.scale, (args) => {
        try {
          return timeCall(compiled.fn, args)
        } catch {
          return Number.NaN
        }
      })
    : null
  return {
    compileError: null,
    cases,
    stdout: sinkText(sink),
    scale,
    quality: job.quality ? analysis.analysis.metrics : null,
    memoryKb: jsHeapKb(),
  }
}

serveJobs(async (job: RunJob) => {
  if (job.kind !== 'function') return emptyResult('This runner only runs JavaScript and TypeScript.')
  return runFunction(job)
})
