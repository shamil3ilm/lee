/**
 * v17 §9.1 — guards for the local-only E2E test sign-in.
 *
 * Deliberately free of any test-identity strings: this module is imported by
 * `next.config.ts` (evaluated by `next build` / `next start`) and must be
 * safe to ship. The provider itself lives in `./test-login-provider.ts` and
 * is only ever loaded behind a literal `process.env.NODE_ENV !== 'production'`
 * check, which the bundler folds to `false` in production builds so the
 * module is never compiled into them.
 */

export const TEST_LOGIN_FLAG = 'E2E_TEST_LOGIN'

type EnvLike = Readonly<Record<string, string | undefined>>

/** True only when the flag is exactly "1". */
export function isTestLoginFlagSet(env: EnvLike): boolean {
  return env[TEST_LOGIN_FLAG] === '1'
}

/** Any non-empty value counts as "someone tried to set it". */
function flagPresent(env: EnvLike): boolean {
  const v = env[TEST_LOGIN_FLAG]
  return typeof v === 'string' && v.trim() !== ''
}

function productionLike(env: EnvLike): boolean {
  return env.NODE_ENV === 'production' || Boolean(env.VERCEL)
}

/**
 * The test sign-in is enabled only when ALL hold:
 *   - NODE_ENV is not 'production'
 *   - VERCEL is unset (never on a Vercel build or runtime, preview included)
 *   - E2E_TEST_LOGIN === '1'
 */
export function isTestLoginEnabled(env: EnvLike): boolean {
  return !productionLike(env) && isTestLoginFlagSet(env)
}

/**
 * Throws when the flag is present in a production-like environment. Called
 * from next.config.ts (so `next build` and `next start` fail loudly) and
 * again when the provider module loads.
 */
export function assertTestLoginNotInProduction(env: EnvLike): void {
  if (!flagPresent(env) || !productionLike(env)) return
  const where = env.VERCEL ? 'VERCEL is set' : 'NODE_ENV=production'
  throw new Error(
    `[employ] ${TEST_LOGIN_FLAG} is set while ${where}. The E2E test sign-in is ` +
      `local-development only; unset ${TEST_LOGIN_FLAG} for this build/runtime.`,
  )
}
