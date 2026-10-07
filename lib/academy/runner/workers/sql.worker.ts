/// <reference lib="webworker" />
import { emptyResult, type RunJob, type RunResult, type SqlJob } from '../protocol'
import { runSqlCases, type SqlEngine } from '../sql-harness'
import { lockNetwork, post, postCase, serveJobs } from './sandbox'

/**
 * SQL runner: PGlite (Postgres compiled to WebAssembly, the same engine the
 * app's tests use) loaded from the jsDelivr CDN in this worker, in memory.
 * Each case runs in a transaction that is rolled back.
 */

export const PGLITE_VERSION = '0.5.8'
const URL_BASE = `https://cdn.jsdelivr.net/npm/@electric-sql/pglite@${PGLITE_VERSION}/dist/index.js`

interface PgLite extends SqlEngine {
  waitReady: Promise<void>
}

let engine: Promise<PgLite> | null = null

function loadEngine(): Promise<PgLite> {
  engine ??= (async () => {
    post({ type: 'status', message: 'Loading Postgres (PGlite)…' })
    const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ URL_BASE)) as { PGlite: new () => PgLite }
    const pg = new mod.PGlite()
    await pg.waitReady
    return pg
  })()
  return engine
}

async function run(job: SqlJob): Promise<RunResult> {
  const pg = await loadEngine()
  lockNetwork()
  post({ type: 'ready' })
  const out = await runSqlCases(pg, job.schema, job.datasets, job.code)
  out.cases.forEach((c, i) => postCase(i, c))
  return { compileError: out.compileError, cases: out.cases, stdout: '', scale: null, quality: null, memoryKb: null }
}

serveJobs(async (job: RunJob) => {
  if (job.kind !== 'sql') return emptyResult('This runner only runs SQL.')
  return run(job)
})
