// Only load DOM matchers when a DOM-like environment is present (e.g. tests
// that opt into `// @vitest-environment happy-dom`). Node env has no
// `document`, so importing `@testing-library/jest-dom/vitest` would crash.
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest')
}

export {}
