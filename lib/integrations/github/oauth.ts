import type { GitHubAppConfig } from '../config'
import { IntegrationHttpError, integrationFetch } from '../http'

/**
 * GitHub App user-to-server OAuth (web flow), per
 * https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
 *   - authorize: client_id, redirect_uri, state, PKCE (S256 only)
 *   - token: client_id, client_secret, code, code_verifier, redirect_uri
 *   - user tokens (ghu_) expire after 8 hours; refresh tokens (ghr_) after
 *     6 months; using a refresh token invalidates it and the old access
 *     token (…/refreshing-user-access-tokens), so a refresh is stored at once.
 * Revoke: DELETE /applications/{client_id}/grant with Basic auth
 * (client_id:client_secret) removes the authorization and every token
 * (https://docs.github.com/en/rest/apps/oauth-applications).
 */

export interface TokenSet {
  access: string
  refresh: string | null
  accessExpiresAt: Date | null
  refreshExpiresAt: Date | null
}

export class GitHubOAuthError extends Error {
  constructor(readonly code: 'bad_code' | 'bad_refresh' | 'rejected' | 'network') {
    super(`github oauth ${code}`)
    this.name = 'GitHubOAuthError'
  }
}

export function buildAuthorizeUrl(
  cfg: GitHubAppConfig,
  input: { state: string; codeChallenge: string; redirectUri: string },
): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
    allow_signup: 'false',
  })
  return `${cfg.webBase}/login/oauth/authorize?${params.toString()}`
}

interface RawToken {
  access_token?: unknown
  refresh_token?: unknown
  expires_in?: unknown
  refresh_token_expires_in?: unknown
  error?: unknown
}

function addSeconds(now: Date, s: unknown): Date | null {
  return typeof s === 'number' && Number.isFinite(s) && s > 0 ? new Date(now.getTime() + s * 1000) : null
}

async function tokenRequest(cfg: GitHubAppConfig, form: Record<string, string>, now: Date, failCode: 'bad_code' | 'bad_refresh'): Promise<TokenSet> {
  let res: Response
  try {
    res = await integrationFetch(`${cfg.webBase}/login/oauth/access_token`, {
      bases: [cfg.webBase],
      label: 'github-token',
      init: {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...form }).toString(),
      },
    })
  } catch {
    throw new GitHubOAuthError('network')
  }
  if (!res.ok) throw new GitHubOAuthError(res.status === 401 ? 'rejected' : failCode)
  // GitHub answers 200 with { error } for a bad or used code / refresh token.
  const body = (await res.json().catch(() => ({}))) as RawToken
  if (typeof body.access_token !== 'string' || !body.access_token) throw new GitHubOAuthError(failCode)
  return {
    access: body.access_token,
    refresh: typeof body.refresh_token === 'string' && body.refresh_token ? body.refresh_token : null,
    accessExpiresAt: addSeconds(now, body.expires_in),
    refreshExpiresAt: addSeconds(now, body.refresh_token_expires_in),
  }
}

export function exchangeCode(
  cfg: GitHubAppConfig,
  input: { code: string; codeVerifier: string; redirectUri: string },
  now: Date = new Date(),
): Promise<TokenSet> {
  return tokenRequest(cfg, { code: input.code, code_verifier: input.codeVerifier, redirect_uri: input.redirectUri }, now, 'bad_code')
}

export function refreshTokens(cfg: GitHubAppConfig, refreshToken: string, now: Date = new Date()): Promise<TokenSet> {
  return tokenRequest(cfg, { grant_type: 'refresh_token', refresh_token: refreshToken }, now, 'bad_refresh')
}

/** Revoke the user's authorization of the app (all its tokens). True on 204 / already gone. */
export async function revokeGrant(cfg: GitHubAppConfig, accessToken: string): Promise<boolean> {
  try {
    const res = await integrationFetch(`${cfg.apiBase}/applications/${encodeURIComponent(cfg.clientId)}/grant`, {
      bases: [cfg.apiBase],
      label: 'github-revoke',
      init: {
        method: 'DELETE',
        headers: {
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
          authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ access_token: accessToken }),
      },
    })
    return res.status === 204 || res.status === 404
  } catch (e) {
    if (e instanceof IntegrationHttpError) return false
    throw e
  }
}
