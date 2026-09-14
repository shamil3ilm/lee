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
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 75 },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
