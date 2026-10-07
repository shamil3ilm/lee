// v17 §9.1 — environment for local/CI E2E runs. Every value is a CI dummy
// (mirrors .github/workflows/ci.yml); no real secret is ever needed because
// sign-in goes through the local-only test provider, not Google.
//
// Passed explicitly to the dev server so values in a developer's .env.local
// (real Google/Gemini keys, a real DATABASE_URL) are overridden, never used.

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100)
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`
/** tests/e2e/github-stub.mjs: the GitHub contents API for Publish. */
export const E2E_GITHUB_STUB_PORT = Number(process.env.E2E_GITHUB_STUB_PORT ?? 3199)
export const E2E_GITHUB_STUB_URL = `http://localhost:${E2E_GITHUB_STUB_PORT}`
/** tests/e2e/latex-stub.mjs: both LaTeX compile services, offline. */
export const E2E_LATEX_STUB_PORT = Number(process.env.E2E_LATEX_STUB_PORT ?? 3198)
export const E2E_LATEX_STUB_URL = `http://localhost:${E2E_LATEX_STUB_PORT}`
export const E2E_DB_DIR = '.e2e/pglite'
export const E2E_AUTH_STATE = '.e2e/auth/test-user.json'

export const E2E_ENV: Readonly<Record<string, string>> = {
  NODE_ENV: 'development',
  E2E_TEST_LOGIN: '1',
  // Deterministic fixture AI (lib/ai/index.ts): document journeys run offline.
  E2E_AI_FIXTURES: '1',
  DATABASE_URL: `pglite:./${E2E_DB_DIR}`,
  AUTH_SECRET: '00000000000000000000000000000000',
  AUTH_GOOGLE_ID: 'dummy',
  AUTH_GOOGLE_SECRET: 'dummy',
  NEXTAUTH_URL: E2E_BASE_URL,
  AUTH_URL: E2E_BASE_URL,
  AUTH_TRUST_HOST: 'true',
  ALLOWED_EMAIL: 'test@example.com',
  AI_PROVIDER: 'gemini',
  GEMINI_API_KEY: 'dummy',
  GROQ_API_KEY: '',
  ANTHROPIC_API_KEY: '',
  OPENAI_API_KEY: '',
  FIRECRAWL_API_KEY: '',
  NEON_API_KEY: '',
  ADZUNA_KEY: '',
  GITHUB_TOKEN: '',
  GITHUB_PORTFOLIO_TOKEN: '',
  GITHUB_API_URL: E2E_GITHUB_STUB_URL,
  // Server-side compiles (PDF route, Make PDF, Drive export) never leave the machine.
  LATEX_ONLINE_URL: `${E2E_LATEX_STUB_URL}/latexonline/data`,
  LATEX_YTOTECH_URL: `${E2E_LATEX_STUB_URL}/ytotech/builds/sync`,
  DECISION_PROVIDER: 'heuristic',
  CRON_SECRET: '00000000000000000000000000000000',
  NEXT_TELEMETRY_DISABLED: '1',
}
