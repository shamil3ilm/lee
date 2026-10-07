import { compileJs, consoleSink, runCase, sinkText, timeCall } from '../js-harness'
import { emptyResult, type FunctionJob, type RunResult } from '../protocol'
import { analyzeJs } from '../quality-js'
import { measureScale } from '../scale'
import { jsHeapKb, lockNetwork, post, postCase } from './sandbox'

/**
 * Runs plain JavaScript inside a runner worker (shared by the JS worker and,
 * after transpiling, the TS worker). Locks the network before any user code.
 */
export async function runJavaScript(source: string, job: FunctionJob): Promise<RunResult> {
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
      }, undefined, (point) => post({ type: 'scale', point }))
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
