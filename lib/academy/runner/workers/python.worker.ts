/// <reference lib="webworker" />
import { capStdout, emptyResult, type CaseOutcome, type FunctionJob, type RunJob, type RunResult } from '../protocol'
import { PYTHON_DRIVER, PYTHON_TIMER } from '../python-harness'
import { measureScale } from '../scale'
import { lockNetwork, post, postCase, serveJobs } from './sandbox'

/**
 * Python runner: Pyodide (CPython on WebAssembly) from the jsDelivr CDN,
 * loaded once per worker and cached by the browser (about 10 MB the first
 * time). The network is locked after it loads, so user code can import the
 * standard library only (no micropip, no packages fetched at run time).
 */

export const PYODIDE_VERSION = '0.29.5'
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

interface PyProxyLike {
  toJs?: () => unknown
}
interface Pyodide {
  runPython(code: string, options?: { globals?: unknown }): unknown
  globals: { set(name: string, value: unknown): void; get(name: string): unknown }
  toPy(value: unknown): unknown
}

let runtime: Promise<Pyodide> | null = null

function loadRuntime(): Promise<Pyodide> {
  runtime ??= (async () => {
    post({ type: 'status', message: 'Loading Python (Pyodide)…' })
    const url = `${INDEX_URL}pyodide.mjs`
    const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url)) as {
      loadPyodide: (o: { indexURL: string }) => Promise<Pyodide>
    }
    const py = await mod.loadPyodide({ indexURL: INDEX_URL })
    // The timer reads the solution namespace the driver (re)defines on every run.
    py.runPython(`import json, time, copy\n${PYTHON_TIMER}`)
    return py
  })()
  return runtime
}

function parseCases(raw: unknown): { compileError: string | null; cases: CaseOutcome[]; stdout: string } {
  const text = typeof raw === 'string' ? raw : String((raw as PyProxyLike)?.toJs?.() ?? '')
  const parsed = JSON.parse(text) as { compileError: string | null; cases: CaseOutcome[]; stdout: string }
  return { compileError: parsed.compileError, cases: parsed.cases, stdout: capStdout(parsed.stdout ?? '') }
}

async function run(job: FunctionJob): Promise<RunResult> {
  const py = await loadRuntime()
  lockNetwork()
  post({ type: 'ready' })
  py.globals.set('__lee_code', job.code)
  py.globals.set('__lee_fn', job.fnName)
  py.globals.set('__lee_cases', JSON.stringify(job.cases))
  py.globals.set('__lee_progress', (i: number, json: string) => postCase(i, JSON.parse(json) as CaseOutcome))
  const result = parseCases(py.runPython(PYTHON_DRIVER))
  if (result.compileError) return { ...emptyResult(result.compileError), stdout: result.stdout }
  const timer = py.globals.get('__lee_time') as ((argsJson: string) => number) | undefined
  const scale =
    job.scale && timer
      ? await measureScale(job.scale, (args) => {
          try {
            return Number(timer(JSON.stringify(args)))
          } catch {
            return Number.NaN
          }
        })
      : null
  return { compileError: null, cases: result.cases, stdout: result.stdout, scale, quality: null, memoryKb: null }
}

serveJobs(async (job: RunJob) => {
  if (job.kind !== 'function' || job.language !== 'python') return emptyResult('This runner only runs Python.')
  return run(job)
})
