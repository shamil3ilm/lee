import { vi } from 'vitest'

// The suite runs with `isolate: false` (one process, shared module cache) so
// the PGlite database is created and migrated once. The cost is that a
// `vi.mock` in one file can leak into every file that runs after it in the
// same process — e.g. a mocked calendar adapter returning a fake event id.
// Resetting the module registry before each file makes every file import
// fresh modules (with only its own mocks) while the DB instance, which lives
// on globalThis, is reused.
vi.resetModules()

// Same problem for globals: a file that swaps `globalThis.fetch` (or uses
// vi.stubGlobal / vi.spyOn) without restoring it breaks later files — the
// PDF renderer then receives JSON when it fetches its WebAssembly binary.
// Keep the pristine fetch from the first file and put it back every time.
const g = globalThis as typeof globalThis & { __pristineFetch?: typeof fetch }
g.__pristineFetch ??= globalThis.fetch
vi.unstubAllGlobals()
vi.restoreAllMocks()
globalThis.fetch = g.__pristineFetch

// Only load DOM matchers when a DOM-like environment is present (e.g. tests
// that opt into `// @vitest-environment happy-dom`). Node env has no
// `document`, so importing `@testing-library/jest-dom/vitest` would crash.
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest')
}

export {}
