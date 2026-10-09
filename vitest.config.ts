import { defineConfig } from 'vitest/config'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

/**
 * Two projects so the suite uses every core:
 *
 *   unit — tests/unit files that never touch the database. No DB setup at
 *          all (no migrations, no per-test TRUNCATE).
 *   db   — tests/integration plus the unit files that import the DB,
 *          factories or drizzle. Each worker is its own process with its own
 *          in-memory PGlite (DATABASE_URL=pglite:memory://), so files run in
 *          parallel across workers; within a worker tests stay serial and the
 *          per-test TRUNCATE (tests/integration/setup.ts) isolates them.
 *
 * A unit file is classified as `db` from its imports, so new DB tests are
 * picked up automatically.
 *
 * VITEST_MAX_WORKERS caps workers (each db worker holds a PGlite instance,
 * ~300–500 MB): CI uses the runner's cores; set it lower on a laptop that is
 * short on memory.
 */
// Static `from '…'` and dynamic `import('…')` both count.
const DB_IMPORT = /(?:from |import\()'(?:@\/(?:tests\/factories|lib\/db\/(?:client|queries|schema|retention|migrate))|drizzle-orm)/

function dbUnitFiles(): string[] {
  const dir = path.resolve(__dirname, 'tests/unit')
  return readdirSync(dir)
    .filter((f) => f.endsWith('.test.ts'))
    .filter((f) => DB_IMPORT.test(readFileSync(path.join(dir, f), 'utf8')))
    .map((f) => `tests/unit/${f}`)
}

const DB_UNIT = dbUnitFiles()
const maxWorkers = Number(process.env.VITEST_MAX_WORKERS) || Math.max(1, Math.min(4, os.availableParallelism() - 1))
const alias = { '@': path.resolve(__dirname, '.') }

export default defineConfig({
  resolve: { alias },
  test: {
    environment: 'node',
    maxWorkers,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['lib/**/*.ts'],
      // Bootstrap floor: raise as tests are added; do NOT add throwaway tests to lift it.
      thresholds: { lines: 70, functions: 65, statements: 70, branches: 60 },
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
          exclude: DB_UNIT,
          setupFiles: ['./tests/env-setup.ts', './tests/setup.ts'],
          // Per-file module reset lives in tests/setup.ts; files share a worker.
          pool: 'forks',
          isolate: false,
          fileParallelism: true,
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'db',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts', ...DB_UNIT],
          setupFiles: ['./tests/env-setup.ts', './tests/setup.ts', './tests/integration/setup.ts'],
          // One in-memory PGlite per worker process: parallel across workers,
          // serial (with TRUNCATE between tests) within one.
          pool: 'forks',
          isolate: false,
          fileParallelism: true,
        },
      },
    ],
  },
})
