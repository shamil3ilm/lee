import * as connQ from '@/lib/db/queries/integrationConnections'
import { logger } from '@/lib/logger'
import { callbackUrl, linkedinAppConfig, LINKEDIN_APP_ENV } from '../config'
import { IntegrationHttpError } from '../http'
import { consumeOAuthState, createOAuthState, randomToken } from '../oauth-state'
import { consumeRateLimit, RATE_RULES } from '../rate-limit'
import { IdTokenError, verifyIdToken } from './id-token'
import { buildAuthorizeUrl, exchangeCode, fetchJwks, fetchUserInfo, LINKEDIN_SHARE_SCOPE, LinkedInOAuthError } from './oauth'

/**
 * SERVER-ONLY. Connect LinkedIn: OIDC sign-in for name, photo and email,
 * plus `w_member_social` only when the user turned posting on. One
 * connection per lee user; LinkedIn tokens do not refresh (60 days), so the
 * card shows the expiry and the user reconnects.
 */

export type StartResult = { ok: true; url: string; state: string } | { ok: false; error: string }

export async function startLinkedInConnect(userId: string, opts: { posting: boolean }, now: Date = new Date()): Promise<StartResult> {
  const cfg = linkedinAppConfig()
  if (!cfg.ok) return { ok: false, error: 'LinkedIn is not configured on this deployment yet.' }
  if (!(await consumeRateLimit(userId, 'linkedin_connect', RATE_RULES.connect, now))) {
    return { ok: false, error: 'Too many connect attempts. Please wait a few minutes.' }
  }
  const nonce = randomToken(24)
  const state = await createOAuthState(userId, 'linkedin', { nonce }, now)
  return { ok: true, state, url: buildAuthorizeUrl(cfg.config, { state, nonce, redirectUri: callbackUrl('linkedin'), posting: opts.posting }) }
}

export type CompleteResult = { ok: true } | { ok: false; reason: 'state' | 'denied' | 'not_configured' | 'exchange' | 'id_token' | 'profile' }

export async function completeLinkedInConnect(
  userId: string,
  input: { code: string | null; state: string | null; cookieState: string | null; error?: string | null },
  now: Date = new Date(),
): Promise<CompleteResult> {
  const cfgResult = linkedinAppConfig()
  if (!cfgResult.ok) return { ok: false, reason: 'not_configured' }
  const cfg = cfgResult.config
  const state = await consumeOAuthState(userId, 'linkedin', input.state, input.cookieState, now)
  if (!state.ok) {
    logger.warn('linkedin_connect_state_rejected', { userId, reason: state.reason })
    return { ok: false, reason: 'state' }
  }
  if (input.error || !input.code) return { ok: false, reason: 'denied' }
  let tokens
  try {
    tokens = await exchangeCode(cfg, { code: input.code, redirectUri: callbackUrl('linkedin') }, now)
  } catch (e) {
    logger.warn('linkedin_connect_exchange_failed', { userId, code: e instanceof LinkedInOAuthError ? e.code : 'unknown' })
    return { ok: false, reason: 'exchange' }
  }
  try {
    if (!tokens.idToken) throw new IdTokenError('malformed')
    const keys = await fetchJwks(cfg, now.getTime())
    const claims = verifyIdToken(tokens.idToken, {
      keys,
      issuers: [cfg.webBase, `${cfg.webBase}/oauth`],
      audience: cfg.clientId,
      nonce: state.secrets.nonce ?? null,
      now,
    })
    const info = await fetchUserInfo(cfg, tokens.access)
    if (info.sub !== claims.sub) throw new IdTokenError('audience')
    await connQ.save(userId, 'linkedin', {
      accountId: info.sub,
      login: null,
      displayName: info.name,
      email: info.email,
      avatarUrl: info.picture,
      scopes: tokens.scopes,
      tokens: { access: tokens.access, refresh: null },
      accessExpiresAt: tokens.expiresAt,
      refreshExpiresAt: null,
      settings: { posting: tokens.scopes.includes(LINKEDIN_SHARE_SCOPE) },
    })
    logger.info('linkedin_connected', { userId, posting: tokens.scopes.includes(LINKEDIN_SHARE_SCOPE) })
    return { ok: true }
  } catch (e) {
    if (e instanceof IdTokenError) {
      logger.warn('linkedin_connect_id_token_rejected', { userId, code: e.code })
      return { ok: false, reason: 'id_token' }
    }
    logger.warn('linkedin_connect_profile_failed', { userId, status: e instanceof IntegrationHttpError ? e.status : null })
    return { ok: false, reason: 'profile' }
  }
}

export interface LinkedInStatus {
  configured: boolean
  missingEnv: string[]
  connected: boolean
  name: string | null
  email: string | null
  avatarUrl: string | null
  canPost: boolean
  expiresAt: string | null
  expired: boolean
}

export async function getLinkedInStatus(userId: string, now: Date = new Date()): Promise<LinkedInStatus> {
  const cfg = linkedinAppConfig()
  const base = { connected: false, name: null, email: null, avatarUrl: null, canPost: false, expiresAt: null, expired: false }
  if (!cfg.ok) return { configured: false, missingEnv: cfg.missing, ...base }
  const conn = await connQ.get(userId, 'linkedin')
  if (!conn) return { configured: true, missingEnv: [], ...base }
  return {
    configured: true,
    missingEnv: [],
    connected: true,
    name: conn.displayName,
    email: conn.email,
    avatarUrl: conn.avatarUrl,
    canPost: conn.scopes.includes(LINKEDIN_SHARE_SCOPE),
    expiresAt: conn.accessExpiresAt?.toISOString() ?? null,
    expired: conn.accessExpiresAt !== null && conn.accessExpiresAt.getTime() <= now.getTime(),
  }
}

/**
 * LinkedIn documents no member token revocation endpoint, so Disconnect
 * deletes the token here; the card links to LinkedIn's "Permitted
 * services" page where the user can also remove lee's access.
 */
export async function disconnectLinkedIn(userId: string, now: Date = new Date()): Promise<{ ok: boolean; error?: string }> {
  if (!(await consumeRateLimit(userId, 'linkedin_disconnect', RATE_RULES.disconnect, now))) {
    return { ok: false, error: 'Too many attempts. Please wait a few minutes.' }
  }
  await connQ.remove(userId, 'linkedin')
  logger.info('linkedin_disconnected', { userId })
  return { ok: true }
}

export { LINKEDIN_APP_ENV }
