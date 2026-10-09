// v17 §9.1 — environment for local/CI E2E runs. Every value is a CI dummy
// (mirrors .github/workflows/ci.yml); no real secret is ever needed because
// sign-in goes through the local-only test provider, not Google.
//
// Passed explicitly to the dev server so values in a developer's .env.local
// (real Google/Gemini keys, a real DATABASE_URL) are overridden, never used.

import { generateKeyPairSync } from 'node:crypto'

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100)
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`
/** tests/e2e/github-stub.mjs: the GitHub contents API for Publish. */
export const E2E_GITHUB_STUB_PORT = Number(process.env.E2E_GITHUB_STUB_PORT ?? 3199)
export const E2E_GITHUB_STUB_URL = `http://localhost:${E2E_GITHUB_STUB_PORT}`
/** tests/e2e/linkedin-stub.mjs: LinkedIn OIDC + Posts for Connect LinkedIn. */
export const E2E_LINKEDIN_STUB_PORT = Number(process.env.E2E_LINKEDIN_STUB_PORT ?? 3197)
export const E2E_LINKEDIN_STUB_URL = `http://localhost:${E2E_LINKEDIN_STUB_PORT}`
/** tests/e2e/latex-stub.mjs: both LaTeX compile services, offline. */
export const E2E_LATEX_STUB_PORT = Number(process.env.E2E_LATEX_STUB_PORT ?? 3198)
export const E2E_LATEX_STUB_URL = `http://localhost:${E2E_LATEX_STUB_PORT}`
export const E2E_DB_DIR = '.e2e/pglite'
export const E2E_AUTH_STATE = '.e2e/auth/test-user.json'

// A throwaway key for the dummy GitHub App (the stub never checks it), made per run.
const E2E_APP_KEY = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

export const E2E_ENV: Readonly<Record<string, string>> = {
  NODE_ENV: 'development',
  E2E_TEST_LOGIN: '1',
  // Deterministic fixture AI (lib/ai/index.ts): document journeys run offline.
  E2E_AI_FIXTURES: '1',
  // Synthetic LinkedIn notification emails for the linkedin_post source (lib/linkedin-posts/e2e-inbox.ts).
  E2E_GMAIL_FIXTURES: '1',
  // Company search (Discovery › Companies) answers offline (lib/company-discovery/search-fixtures.ts).
  E2E_LOOKUP_FIXTURES: '1',
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
  // India MCA company source (data.gov.in): never on in e2e, whatever the shell has.
  DATA_GOV_IN_KEY: '',
  GITHUB_TOKEN: '',
  HF_TOKEN: '',
  GITHUB_PORTFOLIO_TOKEN: '',
  GITHUB_API_URL: E2E_GITHUB_STUB_URL,
  // Portfolio sync: re-check the (stub) repository on every page open.
  PORTFOLIO_PULL_THROTTLE_MS: '0',
  // Connect GitHub / LinkedIn against the local stubs (dummy app credentials).
  GITHUB_WEB_URL: E2E_GITHUB_STUB_URL,
  GITHUB_APP_ID: '1',
  GITHUB_APP_CLIENT_ID: 'Iv1.e2edummy',
  GITHUB_APP_CLIENT_SECRET: 'e2e-dummy-secret',
  GITHUB_APP_PRIVATE_KEY: E2E_APP_KEY,
  GITHUB_APP_SLUG: 'lee-e2e',
  LINKEDIN_CLIENT_ID: 'e2e-linkedin-client',
  LINKEDIN_CLIENT_SECRET: 'e2e-linkedin-secret',
  LINKEDIN_WEB_URL: E2E_LINKEDIN_STUB_URL,
  LINKEDIN_API_URL: E2E_LINKEDIN_STUB_URL,
  // Server-side compiles (PDF route, Make PDF, Drive export) never leave the machine.
  LATEX_ONLINE_URL: `${E2E_LATEX_STUB_URL}/latexonline/data`,
  LATEX_YTOTECH_URL: `${E2E_LATEX_STUB_URL}/ytotech/builds/sync`,
  DECISION_PROVIDER: 'heuristic',
  CRON_SECRET: '00000000000000000000000000000000',
  NEXT_TELEMETRY_DISABLED: '1',
}
