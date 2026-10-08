/**
 * Bundle check for the coding workbench (v13 phase 13.1, §5.5). Run after
 * `pnpm build`: `pnpm check:bundle`. Fails when
 *   1. a runner (the sandbox workers, Pyodide, php-wasm, PGlite, the
 *      TypeScript transpiler) is in any route's initial JavaScript (runners
 *      must load lazily, only inside an exercise);
 *   2. a Playground route's own initial JavaScript (beyond the app shell
 *      every signed-in page shares) is over 200 KB gzipped;
 *   3. any reference solution or approach text appears anywhere in the
 *      client static output (they are server-only until unlocked);
 *   4. fflate (the LaTeX project .zip import/export) is in any route's
 *      initial JavaScript: it must load only when a zip is opened or built.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { gzipSync } from 'node:zlib'
import { loadProblemCatalog } from '@/lib/academy/problems/catalog'

const NEXT = path.resolve('.next')
const BUDGET_KB = 200
/** A string only fflate's unzip code contains. */
const FFLATE_MARKER = 'invalid zip data'
const RUNNER_MARKERS = [
  'Playground sandbox (no network)',
  'cdn.jsdelivr.net/pyodide',
  '@php-wasm/universal',
  '@electric-sql/pglite@',
  'transpileModule',
]

interface Manifest {
  entryJSFiles?: Record<string, string[]>
}

function walk(dir: string, match: (f: string) => boolean): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name)
    return d.isDirectory() ? walk(p, match) : match(d.name) ? [p] : []
  })
}

function routeEntries(): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const rootMain = (JSON.parse(readFileSync(path.join(NEXT, 'build-manifest.json'), 'utf8')) as { rootMainFiles: string[] }).rootMainFiles
  for (const file of walk(path.join(NEXT, 'server', 'app'), (f) => f === 'page_client-reference-manifest.js')) {
    const ctx: { globalThis?: unknown; __RSC_MANIFEST?: Record<string, Manifest> } = {}
    ctx.globalThis = ctx
    vm.runInNewContext(readFileSync(file, 'utf8'), ctx)
    for (const [route, m] of Object.entries(ctx.__RSC_MANIFEST ?? {})) {
      const files = new Set<string>(rootMain)
      for (const list of Object.values(m.entryJSFiles ?? {})) for (const f of list) files.add(f)
      out.set(route, [...files])
    }
  }
  return out
}

/** Chunks of the root and authed layouts (identical on every signed-in page). */
function shellFiles(): string[] {
  const rootMain = (JSON.parse(readFileSync(path.join(NEXT, 'build-manifest.json'), 'utf8')) as { rootMainFiles: string[] }).rootMainFiles
  const file = walk(path.join(NEXT, 'server', 'app', '(authed)'), (f) => f === 'page_client-reference-manifest.js')[0]
  if (!file) return rootMain
  const ctx: { globalThis?: unknown; __RSC_MANIFEST?: Record<string, Manifest> } = {}
  ctx.globalThis = ctx
  vm.runInNewContext(readFileSync(file, 'utf8'), ctx)
  const m = Object.values(ctx.__RSC_MANIFEST ?? {})[0]
  const layouts = Object.entries(m?.entryJSFiles ?? {}).filter(([k]) => k === '[project]/app/layout' || k === '[project]/app/(authed)/layout')
  return [...new Set([...rootMain, ...layouts.flatMap(([, v]) => v)])]
}

const cache = new Map<string, string>()
function chunk(rel: string): string {
  const key = rel.replace(/^\/?_next\//, '')
  if (!cache.has(key)) {
    const p = path.join(NEXT, key)
    cache.set(key, existsSync(p) ? readFileSync(p, 'utf8') : '')
  }
  return cache.get(key) ?? ''
}

function gzKb(files: readonly string[]): number {
  return files.reduce((s, f) => s + gzipSync(chunk(f)).length, 0) / 1024
}

/** Distinctive, quote-free lines of a text (what a bundled string literal would contain verbatim). */
function needles(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 28 && !/["'`\\]/.test(l))
    .sort((a, b) => b.length - a.length)
    .slice(0, 2)
}

function main(): void {
  if (!existsSync(path.join(NEXT, 'build-manifest.json'))) {
    console.error('No .next build found: run `pnpm build` first.')
    process.exit(1)
  }
  const failures: string[] = []
  const routes = routeEntries()
  if (routes.size === 0) failures.push('No client reference manifests found under .next/server/app.')

  for (const [route, files] of routes) {
    for (const marker of RUNNER_MARKERS) {
      const hit = files.find((f) => chunk(f).includes(marker))
      if (hit) failures.push(`${route}: initial chunk ${hit} contains runner code ("${marker}")`)
    }
  }

  // §5.5: the app shell (root + authed layout chunks, shared by every page)
  // stays as it is; each Playground route's own initial JavaScript on top of
  // it must stay within the budget.
  const shell = new Set(shellFiles())
  console.log(`app shell (every authed page): ${gzKb([...shell]).toFixed(1)} KB gzipped`)
  const playground = [...routes].filter(([r]) => r.includes('/playground'))
  for (const [route, files] of playground) {
    const own = files.filter((f) => !shell.has(f))
    const kb = gzKb(own)
    console.log(`${route.padEnd(52)} ${kb.toFixed(1).padStart(7)} KB gzipped route JS (${gzKb(files).toFixed(1)} KB with the shell)`)
    if (kb > BUDGET_KB) failures.push(`${route}: route JS ${kb.toFixed(1)} KB gzipped > ${BUDGET_KB} KB budget`)
  }

  for (const [route, files] of routes) {
    const hit = files.find((f) => chunk(f).includes(FFLATE_MARKER))
    if (hit) failures.push(`${route}: initial chunk ${hit} contains fflate (the zip import must be lazy)`)
  }
  const zipChunks = walk(path.join(NEXT, 'static'), (f) => f.endsWith('.js')).filter((f) => readFileSync(f, 'utf8').includes(FFLATE_MARKER))
  console.log(`fflate chunks (lazy): ${zipChunks.length}`)
  if (zipChunks.length === 0) failures.push('No fflate chunk found: the LaTeX zip import was not built.')

  const runnerChunks = walk(path.join(NEXT, 'static'), (f) => f.endsWith('.js')).filter((f) => {
    const src = readFileSync(f, 'utf8')
    return RUNNER_MARKERS.some((m) => src.includes(m))
  })
  console.log(`runner chunks (lazy): ${runnerChunks.length}`)
  if (runnerChunks.length === 0) failures.push('No runner chunk found: the workers were not built.')

  const statics = walk(path.join(NEXT, 'static'), (f) => f.endsWith('.js')).map((f) => readFileSync(f, 'utf8'))
  let checked = 0
  for (const p of loadProblemCatalog().problems) {
    for (const needle of [...needles(p.reference.code), ...needles(p.reference.approach)]) {
      checked++
      if (statics.some((src) => src.includes(needle))) failures.push(`${p.slug}: reference text found in the client bundle: "${needle.slice(0, 60)}"`)
    }
  }
  console.log(`reference fragments checked against ${statics.length} client files: ${checked}`)

  if (failures.length > 0) {
    console.error(`\nPlayground bundle check failed:\n- ${failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log('\nPlayground bundle check passed.')
}

main()
