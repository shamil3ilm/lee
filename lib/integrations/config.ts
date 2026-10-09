/**
 * SERVER-ONLY. Deployment-level app credentials for Connect GitHub (a GitHub
 * App) and Connect LinkedIn (a LinkedIn developer app), read from env at
 * call time. A missing value never fails boot: Settings › Integrations
 * shows "not configured" with the setup steps instead
 * (docs/integrations-github-linkedin.md).
 *
 * Base URLs can be pointed at offline stubs for e2e runs (GITHUB_WEB_URL,
 * GITHUB_API_URL, LINKEDIN_WEB_URL, LINKEDIN_API_URL). An override must be
 * https, except a localhost URL outside production — so a stray env value
 * can never send tokens to an internal plain-http address in production.
 */

export type IntegrationProvider = 'github' | 'linkedin'

type Env = Readonly<Record<string, string | undefined>>

export interface GitHubAppConfig {
  appId: string
  clientId: string
  clientSecret: string
  privateKey: string
  slug: string
  webBase: string
  apiBase: string
}

export interface LinkedInAppConfig {
  clientId: string
  clientSecret: string
  webBase: string
  apiBase: string
}

export type ConfigResult<T> = { ok: true; config: T } | { ok: false; missing: string[] }

export const GITHUB_APP_ENV = [
  'GITHUB_APP_ID',
  'GITHUB_APP_CLIENT_ID',
  'GITHUB_APP_CLIENT_SECRET',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_APP_SLUG',
] as const

export const LINKEDIN_APP_ENV = ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'] as const

function value(env: Env, key: string): string | null {
  const v = env[key]?.trim()
  return v ? v : null
}

/** An override base URL, or the default when unset / not allowed. */
export function safeBase(raw: string | undefined, fallback: string, env: Env = process.env): string {
  const v = raw?.trim()
  if (!v) return fallback
  let u: URL
  try {
    u = new URL(v)
  } catch {
    return fallback
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
  const allowed = u.protocol === 'https:' || (u.protocol === 'http:' && local && env.NODE_ENV !== 'production')
  return allowed ? v.replace(/\/$/, '') : fallback
}

/** Vercel stores multi-line values as typed; a pasted key often has literal "\n". */
export function normalizePem(raw: string): string {
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw
}

export function githubAppConfig(env: Env = process.env): ConfigResult<GitHubAppConfig> {
  const missing = GITHUB_APP_ENV.filter((k) => !value(env, k))
  if (missing.length > 0) return { ok: false, missing }
  return {
    ok: true,
    config: {
      appId: value(env, 'GITHUB_APP_ID')!,
      clientId: value(env, 'GITHUB_APP_CLIENT_ID')!,
      clientSecret: value(env, 'GITHUB_APP_CLIENT_SECRET')!,
      privateKey: normalizePem(value(env, 'GITHUB_APP_PRIVATE_KEY')!),
      slug: value(env, 'GITHUB_APP_SLUG')!,
      webBase: safeBase(env.GITHUB_WEB_URL, 'https://github.com', env),
      apiBase: safeBase(env.GITHUB_API_URL, 'https://api.github.com', env),
    },
  }
}

export function linkedinAppConfig(env: Env = process.env): ConfigResult<LinkedInAppConfig> {
  const missing = LINKEDIN_APP_ENV.filter((k) => !value(env, k))
  if (missing.length > 0) return { ok: false, missing }
  return {
    ok: true,
    config: {
      clientId: value(env, 'LINKEDIN_CLIENT_ID')!,
      clientSecret: value(env, 'LINKEDIN_CLIENT_SECRET')!,
      webBase: safeBase(env.LINKEDIN_WEB_URL, 'https://www.linkedin.com', env),
      apiBase: safeBase(env.LINKEDIN_API_URL, 'https://api.linkedin.com', env),
    },
  }
}

/** The app's public origin (the OAuth redirect URIs registered with each provider). */
export function appOrigin(env: Env = process.env): string {
  const raw = value(env, 'AUTH_URL') ?? value(env, 'NEXTAUTH_URL') ?? 'http://localhost:3000'
  return new URL(raw).origin
}

export function callbackUrl(provider: IntegrationProvider, env: Env = process.env): string {
  return `${appOrigin(env)}/api/integrations/${provider}/callback`
}
