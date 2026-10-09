import * as connQ from '@/lib/db/queries/integrationConnections'
import { logger } from '@/lib/logger'
import { githubAppConfig, type GitHubAppConfig } from '../config'
import { GitHubOAuthError, refreshTokens } from './oauth'

/**
 * SERVER-ONLY. The signed-in user's GitHub user access token, refreshed
 * when it is within five minutes of expiring. GitHub rotates both tokens
 * on refresh, so the new pair is stored before it is used. A refused
 * refresh (revoked, or the 6-month refresh token expired) leaves the
 * connection in place and reports `expired`: the user reconnects.
 */

const SKEW_MS = 5 * 60_000

export type UserTokenResult =
  | { ok: true; token: string; cfg: GitHubAppConfig }
  | { ok: false; reason: 'not_configured' | 'not_connected' | 'expired' | 'network' }

export async function getGitHubUserToken(userId: string, now: Date = new Date()): Promise<UserTokenResult> {
  const cfgResult = githubAppConfig()
  if (!cfgResult.ok) return { ok: false, reason: 'not_configured' }
  const cfg = cfgResult.config
  const stored = await connQ.getTokens(userId, 'github')
  if (!stored) return { ok: false, reason: 'not_connected' }
  const fresh = !stored.accessExpiresAt || stored.accessExpiresAt.getTime() - SKEW_MS > now.getTime()
  if (fresh) return { ok: true, token: stored.access, cfg }
  if (!stored.refresh || (stored.refreshExpiresAt && stored.refreshExpiresAt.getTime() <= now.getTime())) {
    return { ok: false, reason: 'expired' }
  }
  try {
    const next = await refreshTokens(cfg, stored.refresh, now)
    await connQ.updateTokens(userId, 'github', { access: next.access, refresh: next.refresh ?? stored.refresh }, next.accessExpiresAt, next.refreshExpiresAt ?? stored.refreshExpiresAt)
    logger.info('github_token_refreshed', { userId })
    return { ok: true, token: next.access, cfg }
  } catch (e) {
    const code = e instanceof GitHubOAuthError ? e.code : 'network'
    logger.warn('github_token_refresh_failed', { userId, code })
    return { ok: false, reason: code === 'network' ? 'network' : 'expired' }
  }
}
