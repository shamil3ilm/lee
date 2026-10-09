import type { LinkedInAppConfig } from '../config'
import { integrationFetch, integrationJson } from '../http'

/**
 * Sign In with LinkedIn using OpenID Connect + Share on LinkedIn, per
 *   https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
 *   https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
 * - authorize: response_type=code, client_id, redirect_uri, state, scope
 *   (space-delimited), plus an OIDC nonce checked in the id_token;
 * - token: form-encoded grant_type, code, client_id, client_secret, redirect_uri;
 * - access tokens live 60 days; refresh tokens are only for approved
 *   partners, so the user reconnects when the token expires;
 * - PKCE is only offered to native clients, so the web flow relies on
 *   `state` + the client secret (…/authorization-code-flow-native).
 */

export const LINKEDIN_BASE_SCOPES = ['openid', 'profile', 'email'] as const
export const LINKEDIN_SHARE_SCOPE = 'w_member_social'

export function linkedinScopes(posting: boolean): string[] {
  return posting ? [...LINKEDIN_BASE_SCOPES, LINKEDIN_SHARE_SCOPE] : [...LINKEDIN_BASE_SCOPES]
}

export function buildAuthorizeUrl(
  cfg: LinkedInAppConfig,
  input: { state: string; nonce: string; redirectUri: string; posting: boolean },
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
    nonce: input.nonce,
    scope: linkedinScopes(input.posting).join(' '),
  })
  return `${cfg.webBase}/oauth/v2/authorization?${params.toString()}`
}

export class LinkedInOAuthError extends Error {
  constructor(readonly code: 'bad_code' | 'network') {
    super(`linkedin oauth ${code}`)
    this.name = 'LinkedInOAuthError'
  }
}

export interface LinkedInTokens {
  access: string
  idToken: string | null
  expiresAt: Date | null
  scopes: string[]
}

export async function exchangeCode(cfg: LinkedInAppConfig, input: { code: string; redirectUri: string }, now: Date = new Date()): Promise<LinkedInTokens> {
  let res: Response
  try {
    res = await integrationFetch(`${cfg.webBase}/oauth/v2/accessToken`, {
      bases: [cfg.webBase],
      label: 'linkedin-token',
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: input.code,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          redirect_uri: input.redirectUri,
        }).toString(),
      },
    })
  } catch {
    throw new LinkedInOAuthError('network')
  }
  if (!res.ok) throw new LinkedInOAuthError('bad_code')
  const body = (await res.json().catch(() => ({}))) as { access_token?: unknown; expires_in?: unknown; id_token?: unknown; scope?: unknown }
  if (typeof body.access_token !== 'string' || !body.access_token) throw new LinkedInOAuthError('bad_code')
  return {
    access: body.access_token,
    idToken: typeof body.id_token === 'string' ? body.id_token : null,
    expiresAt: typeof body.expires_in === 'number' && body.expires_in > 0 ? new Date(now.getTime() + body.expires_in * 1000) : null,
    scopes: typeof body.scope === 'string' ? body.scope.split(/[\s,]+/).filter(Boolean) : [],
  }
}

export interface LinkedInUserInfo {
  sub: string
  name: string | null
  picture: string | null
  email: string | null
}

/** GET /v2/userinfo (OIDC). `email` is optional in LinkedIn's answer. */
export async function fetchUserInfo(cfg: LinkedInAppConfig, accessToken: string): Promise<LinkedInUserInfo> {
  const { body } = await integrationJson<Record<string, unknown>>(`${cfg.apiBase}/v2/userinfo`, {
    bases: [cfg.apiBase],
    label: 'linkedin-userinfo',
    init: { headers: { authorization: `Bearer ${accessToken}` } },
  })
  const s = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
  const sub = s(body.sub)
  if (!sub) throw new LinkedInOAuthError('bad_code')
  const picture = s(body.picture)
  return { sub, name: s(body.name), picture: picture?.startsWith('https://') ? picture : null, email: s(body.email) }
}

const jwksCache = new Map<string, { at: number; keys: Array<Record<string, unknown>> }>()
const JWKS_TTL_MS = 60 * 60_000

export async function fetchJwks(cfg: LinkedInAppConfig, now: number = Date.now()): Promise<Array<Record<string, unknown>>> {
  const cached = jwksCache.get(cfg.webBase)
  if (cached && now - cached.at < JWKS_TTL_MS) return cached.keys
  const { body } = await integrationJson<{ keys?: unknown }>(`${cfg.webBase}/oauth/openid/jwks`, { bases: [cfg.webBase], label: 'linkedin-jwks' })
  const keys = Array.isArray(body.keys) ? (body.keys as Array<Record<string, unknown>>) : []
  jwksCache.set(cfg.webBase, { at: now, keys })
  return keys
}

export function clearJwksCache(): void {
  jwksCache.clear()
}
