/// <reference lib="webworker" />
import { capStdout, emptyResult, type CaseOutcome, type FunctionJob, type RunJob, type RunResult } from '../protocol'
import { PHP_CASES_DRIVER, PHP_INPUT_PATH, PHP_SOLUTION_PATH, PHP_TIMER_DRIVER, phpFatal, phpSource, readMarked } from '../php-harness'
import { measureScale } from '../scale'
import { lockNetwork, post, serveJobs } from './sandbox'

/**
 * PHP runner: PHP 8.3 compiled to WebAssembly by the WordPress Playground
 * project (@php-wasm, GPL-2.0-or-later, maintained), loaded from the
 * jsDelivr CDN only when a PHP job arrives: about 18 MB of wasm the first
 * time (≈ 5 MB compressed), cached by the browser afterwards. Networking is
 * off: no TCP-over-fetch is configured and the WebSocket shim refuses to
 * connect; the worker's network APIs are locked after load as well.
 */

export const PHP_WASM_VERSION = '3.1.57'
const CDN = 'https://cdn.jsdelivr.net/npm'

interface PhpResponse {
  text: string
}
interface Php {
  run(req: { code: string }): Promise<PhpResponse>
  writeFile(path: string, data: string): void
}

let runtime: Promise<Php> | null = null

function noSockets() {
  return {
    websocket: {
      decorator: (Base: new () => object) =>
        class extends Base {
          constructor() {
            try {
              super()
            } catch {
              /* no sockets in the sandbox */
            }
          }
          send() {
            return null
          }
        },
    },
  }
}

function loadRuntime(): Promise<Php> {
  runtime ??= (async () => {
    post({ type: 'status', message: 'Loading PHP 8.3 (WebAssembly, first time ≈ 5 MB)…' })
    const universalUrl = `${CDN}/@php-wasm/universal@${PHP_WASM_VERSION}/+esm`
    const loaderUrl = `${CDN}/@php-wasm/web-8-3@${PHP_WASM_VERSION}/asyncify/php_8_3.js`
    const universal = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ universalUrl)) as {
      loadPHPRuntime: (loader: unknown, options: unknown) => Promise<number>
      PHP: new (runtimeId: number) => Php
    }
    const loader = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ loaderUrl)
    const id = await universal.loadPHPRuntime(loader, { ...noSockets(), phpWasmAsyncMode: 'asyncify' })
    return new universal.PHP(id)
  })()
  return runtime
}

async function runScript(php: Php, script: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const res = await php.run({ code: script })
    return { ok: true, text: res.text }
  } catch (err) {
    // php.run throws on a non-zero exit (fatal errors outside our try/catch).
    const raw = err instanceof Error ? err.message : String(err)
    return { ok: false, error: phpFatal(raw.replace(/^PHP\.run\(\) failed with exit code \d+\.?\s*/, '').replace(/=== (Stdout|Stderr) ===/g, '')) }
  }
}

interface CasesOut {
  compileError: string | null
  cases: CaseOutcome[]
  stdout: string
  memoryKb: number | null
}

async function run(job: FunctionJob): Promise<RunResult> {
  const php = await loadRuntime()
  lockNetwork()
  post({ type: 'ready' })
  php.writeFile(PHP_SOLUTION_PATH, phpSource(job.code))
  php.writeFile(PHP_INPUT_PATH, JSON.stringify({ fn: job.fnName, cases: job.cases }))
  const res = await runScript(php, PHP_CASES_DRIVER)
  if (!res.ok) return emptyResult(res.error)
  const out = readMarked<CasesOut>(res.text)
  if (!out) return emptyResult('The PHP run stopped before returning results (exit() or a fatal error).')
  const stdout = capStdout(`${res.text.slice(0, res.text.lastIndexOf('__LEE_RESULT__')).trim()}${out.stdout ?? ''}`)
  if (out.compileError) return { ...emptyResult(out.compileError), stdout }
  const scale = job.scale
    ? await measureScale(job.scale, async (args) => {
        php.writeFile(PHP_INPUT_PATH, JSON.stringify({ fn: job.fnName, args }))
        const t = await runScript(php, PHP_TIMER_DRIVER)
        const ms = t.ok ? readMarked<{ ms: number }>(t.text)?.ms : undefined
        return typeof ms === 'number' && ms >= 0 ? ms : Number.NaN
      })
    : null
  return { compileError: null, cases: out.cases, stdout, scale, quality: null, memoryKb: out.memoryKb ?? null }
}

serveJobs(async (job: RunJob) => {
  if (job.kind !== 'function' || job.language !== 'php') return emptyResult('This runner only runs PHP.')
  return run(job)
})
