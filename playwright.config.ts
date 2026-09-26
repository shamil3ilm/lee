import { defineConfig, devices } from '@playwright/test'
import { E2E_AUTH_STATE, E2E_BASE_URL, E2E_ENV, E2E_PORT } from './tests/e2e/env'

// v17 §9.1 — E2E runs against `next dev` (the only mode where the local test
// sign-in exists) on a dedicated port, with a freshly seeded PGlite file DB
// and CI dummy env. `.env.local` values are overridden by E2E_ENV, so a
// developer's real keys and database are never used.
//
// Set E2E_REUSE_SERVER=1 to attach to an already-running e2e dev server
// (started with the same env) while iterating locally; note the DB is only
// reseeded when the server starts.
export default defineConfig({
  testDir: './tests/e2e',
  // Visual QA is opt-in (`pnpm e2e:screens`), not part of the gate.
  testIgnore: process.env.E2E_SCREENS ? [] : ['**/visual/**'],
  globalSetup: './tests/e2e/global-setup.ts',
  // One seeded DB shared by every test: run files serially so journeys that
  // mutate data never race each other.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  webServer: {
    command: `pnpm e2e:seed && pnpm exec next dev --port ${E2E_PORT}`,
    url: `${E2E_BASE_URL}/api/health`,
    env: { ...E2E_ENV },
    reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  use: {
    baseURL: E2E_BASE_URL,
    storageState: E2E_AUTH_STATE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Dev-server first compiles can be slow; be generous on navigation.
    navigationTimeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
