/// <reference lib="webworker" />
import ts from 'typescript'
import { emptyResult, type FunctionJob, type RunJob, type RunResult } from '../protocol'
import { runJavaScript } from './js-run'
import { serveJobs } from './sandbox'

/**
 * TypeScript runner: transpiles with the `typescript` package's
 * transpileModule (types are stripped, not checked), then runs the
 * JavaScript like the JS runner. Its own worker, so the transpiler (≈ 1 MB
 * gzipped, cached) loads only for TypeScript and always before the network
 * lock.
 */

function transpile(code: string): { ok: true; js: string } | { ok: false; error: string } {
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

async function run(job: FunctionJob): Promise<RunResult> {
  const t = transpile(job.code)
  if (!t.ok) return emptyResult(t.error)
  return runJavaScript(t.js, job)
}

serveJobs(async (job: RunJob) => {
  if (job.kind !== 'function' || job.language !== 'typescript') return emptyResult('This runner only runs TypeScript.')
  return run(job)
})
