/// <reference lib="webworker" />
import { emptyResult, type RunJob } from '../protocol'
import { runJavaScript } from './js-run'
import { serveJobs } from './sandbox'

/**
 * JavaScript runner (Web Worker, never the main thread). Kept free of the
 * TypeScript transpiler so a JavaScript run downloads only the harness.
 */
serveJobs(async (job: RunJob) => {
  if (job.kind !== 'function' || job.language !== 'javascript') return emptyResult('This runner only runs JavaScript.')
  return runJavaScript(job.code, job)
})
