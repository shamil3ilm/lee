import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    // Integration tests need Node APIs (fs, drizzle, pglite). happy-dom is
    // still fine for the small number of component/DOM-touching unit tests
    // we'll add later; switch per-file with the `// @vitest-environment
    // happy-dom` directive when needed.
    environment: 'node',
    setupFiles: [
      './tests/env-setup.ts',
      './tests/setup.ts',
      './tests/integration/setup.ts',
    ],
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    // Serialize integration tests: the DB client is a global PGlite singleton
    // per process, and TRUNCATE between tests only works when tests do not
    // run in parallel.
    pool: 'forks',
    isolate: false,
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['lib/**/*.ts'],
      // Bootstrap floor: current coverage after the initial 8-phase build is
      // roughly 70% statements / 60% branches. The target per spec §10 is
      // 80% overall with 90%+ on services and the AI parser. Raise these
      // thresholds as new tests are added — do NOT add throwaway tests just
      // to lift the floor.
      thresholds: { lines: 70, functions: 65, statements: 70, branches: 60 },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
