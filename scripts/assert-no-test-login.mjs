#!/usr/bin/env node
// v17 §9.1 — post-build guard: fail if the local-only E2E test sign-in was
// compiled into the production build in `.next/`. The provider and button are
// imported only behind a literal `process.env.NODE_ENV !== 'production'`
// check, which `next build` folds to false; this proves it stayed that way.
//
// Checks (a) every emitted file for the test identity/provider strings and
// (b) every source map's module list for the test-login modules. Source-map
// `sourcesContent` is ignored: it embeds the original text of files such as
// lib/auth/config.ts (comments and the dead import string), not compiled code.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.argv[2] ?? '.next')
const SKIP_DIRS = new Set(['cache', 'dev'])
const MARKERS = ['e2e-test-login', 'e2e@lee.test', 'Sign in as E2E test user', 'authorizeTestUser']
const MODULE_PATTERN = /test-login(-provider|-form)?\.tsx?$|lib\/auth\/test-login\.ts$/

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    // Symlinks point into node_modules (externals); not build output.
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(full)
    } else if (entry.isFile()) {
      yield full
    }
  }
}

try {
  statSync(ROOT)
} catch {
  console.error(`assert-no-test-login: ${ROOT} not found — run \`pnpm build\` first.`)
  process.exit(2)
}

const hits = []
let scanned = 0
for (const file of walk(ROOT)) {
  scanned += 1
  if (file.endsWith('.map')) {
    try {
      const map = JSON.parse(readFileSync(file, 'utf8'))
      const sections = Array.isArray(map.sections) ? map.sections.map((s) => s.map) : [map]
      for (const s of sections) {
        for (const src of s?.sources ?? []) {
          if (MODULE_PATTERN.test(src.replaceAll('\\', '/'))) hits.push(`${file}: bundles module ${src}`)
        }
      }
    } catch {
      /* not JSON — ignore */
    }
    continue
  }
  if (statSync(file).size > 20 * 1024 * 1024) continue
  const text = readFileSync(file, 'latin1')
  for (const m of MARKERS) if (text.includes(m)) hits.push(`${file}: contains "${m}"`)
}

if (hits.length > 0) {
  console.error('assert-no-test-login: the E2E test sign-in leaked into the production build:')
  for (const h of hits.slice(0, 50)) console.error(`  ${h}`)
  process.exit(1)
}
console.log(`assert-no-test-login: OK — scanned ${scanned} files in ${ROOT}, no test sign-in code.`)
