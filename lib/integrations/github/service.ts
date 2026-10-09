import * as connQ from '@/lib/db/queries/integrationConnections'
import * as statsQ from '@/lib/db/queries/githubRepoStats'
import { logger } from '@/lib/logger'
import { callbackUrl, githubAppConfig, GITHUB_APP_ENV, type GitHubAppConfig } from '../config'
import { IntegrationHttpError } from '../http'
import { consumeOAuthState, createOAuthState, pkceChallenge, randomToken } from '../oauth-state'
import { consumeRateLimit, RATE_RULES } from '../rate-limit'
import { findAppInstallation, getUser, listInstallationRepos, listUserInstallations, type Installation } from './api'
import { buildAuthorizeUrl, exchangeCode, GitHubOAuthError, revokeGrant } from './oauth'
import { getGitHubUserToken } from './token'

/**
 * SERVER-ONLY. Connect GitHub (Settings › Integrations › GitHub): start the
 * GitHub App user authorization, complete it on the callback, show what is
 * connected, test it and disconnect. Every step is for the signed-in user
 * only; nothing ever falls back to another user's connection.
 */

export type StartResult = { ok: true; url: string; state: string } | { ok: false; error: string }

export async function startGitHubConnect(userId: string, now: Date = new Date()): Promise<StartResult> {
  const cfg = githubAppConfig()
  if (!cfg.ok) return { ok: false, error: 'GitHub is not configured on this deployment yet.' }
  if (!(await consumeRateLimit(userId, 'github_connect', RATE_RULES.connect, now))) {
    return { ok: false, error: 'Too many connect attempts. Please wait a few minutes.' }
  }
  const codeVerifier = randomToken(48)
  const state = await createOAuthState(userId, 'github', { codeVerifier }, now)
  const url = buildAuthorizeUrl(cfg.config, { state, codeChallenge: pkceChallenge(codeVerifier), redirectUri: callbackUrl('github') })
  return { ok: true, url, state }
}

export type CompleteResult = { ok: true; login: string } | { ok: false; reason: 'state' | 'denied' | 'not_configured' | 'exchange' | 'profile' }

export async function completeGitHubConnect(
  userId: string,
  input: { code: string | null; state: string | null; cookieState: string | null; error?: string | null },
  now: Date = new Date(),
): Promise<CompleteResult> {
  const cfgResult = githubAppConfig()
  if (!cfgResult.ok) return { ok: false, reason: 'not_configured' }
  const cfg = cfgResult.config
  const state = await consumeOAuthState(userId, 'github', input.state, input.cookieState, now)
  if (!state.ok) {
    logger.warn('github_connect_state_rejected', { userId, reason: state.reason })
    return { ok: false, reason: 'state' }
  }
  if (input.error || !input.code) return { ok: false, reason: 'denied' }
  if (!state.secrets.codeVerifier) return { ok: false, reason: 'state' }
  let tokens
  try {
    tokens = await exchangeCode(cfg, { code: input.code, codeVerifier: state.secrets.codeVerifier, redirectUri: callbackUrl('github') }, now)
  } catch (e) {
    logger.warn('github_connect_exchange_failed', { userId, code: e instanceof GitHubOAuthError ? e.code : 'unknown' })
    return { ok: false, reason: 'exchange' }
  }
  try {
    const user = await getUser(cfg, tokens.access)
    const installation = await findInstallation(cfg, tokens.access)
    await connQ.save(userId, 'github', {
      accountId: user.id,
      login: user.login,
      displayName: user.name,
      email: null,
      avatarUrl: user.avatarUrl,
      scopes: permissionList(installation),
      tokens: { access: tokens.access, refresh: tokens.refresh },
      accessExpiresAt: tokens.accessExpiresAt,
      refreshExpiresAt: tokens.refreshExpiresAt,
      installationId: installation?.id ?? null,
    })
    logger.info('github_connected', { userId, installed: installation !== null })
    return { ok: true, login: user.login }
  } catch (e) {
    logger.warn('github_connect_profile_failed', { userId, status: e instanceof IntegrationHttpError ? e.status : null })
    return { ok: false, reason: 'profile' }
  }
}

async function findInstallation(cfg: GitHubAppConfig, token: string): Promise<Installation | null> {
  return findAppInstallation(await listUserInstallations(cfg, token), cfg)
}

/** "contents:write", "metadata:read", … from an installation's permission map. */
export function permissionList(installation: Installation | null): string[] {
  if (!installation) return []
  return Object.entries(installation.permissions)
    .map(([k, v]) => `${k}:${v}`)
    .sort()
}

export interface GitHubStatus {
  configured: boolean
  missingEnv: string[]
  connected: boolean
  login: string | null
  name: string | null
  avatarUrl: string | null
  /** Token problem the user must fix by reconnecting. */
  needsReconnect: boolean
  installed: boolean
  repositorySelection: 'all' | 'selected' | null
  permissions: string[]
  repos: Array<{ fullName: string; isPrivate: boolean; htmlUrl: string }>
  installUrl: string | null
  manageUrl: string | null
  /** Repos could not be listed right now (GitHub unreachable / rate limited). */
  reposUnavailable: boolean
  followStarred: boolean
}

const EMPTY_STATUS: Omit<GitHubStatus, 'configured' | 'missingEnv'> = {
  connected: false,
  login: null,
  name: null,
  avatarUrl: null,
  needsReconnect: false,
  installed: false,
  repositorySelection: null,
  permissions: [],
  repos: [],
  installUrl: null,
  manageUrl: null,
  reposUnavailable: false,
  followStarred: false,
}

/** The settings card: who is connected, where the app is installed, with which permissions. */
export async function getGitHubStatus(userId: string, now: Date = new Date()): Promise<GitHubStatus> {
  const cfgResult = githubAppConfig()
  if (!cfgResult.ok) return { configured: false, missingEnv: cfgResult.missing, ...EMPTY_STATUS }
  const cfg = cfgResult.config
  const installUrl = `${cfg.webBase}/apps/${cfg.slug}/installations/new`
  const conn = await connQ.get(userId, 'github')
  if (!conn) return { configured: true, missingEnv: [], ...EMPTY_STATUS, installUrl }
  const base: GitHubStatus = {
    configured: true,
    missingEnv: [],
    ...EMPTY_STATUS,
    connected: true,
    login: conn.login,
    name: conn.displayName,
    avatarUrl: conn.avatarUrl,
    permissions: conn.scopes,
    installUrl,
    followStarred: conn.settings.followStarred === true,
  }
  const token = await getGitHubUserToken(userId, now)
  if (!token.ok) return { ...base, needsReconnect: token.reason === 'expired', reposUnavailable: true }
  try {
    const installation = await findInstallation(cfg, token.token)
    const installationId = installation?.id ?? null
    const permissions = permissionList(installation)
    if (installationId !== conn.installationId) await connQ.updateMeta(userId, 'github', { installationId })
    if (!installation) return { ...base, permissions }
    const repos = await listInstallationRepos(cfg, token.token, installation.id)
    return {
      ...base,
      installed: true,
      permissions,
      repositorySelection: installation.repositorySelection,
      repos: repos.slice(0, 50).map((r) => ({ fullName: r.fullName, isPrivate: r.isPrivate, htmlUrl: r.htmlUrl })),
      manageUrl: `${cfg.webBase}/settings/installations/${installation.id}`,
    }
  } catch (e) {
    const status = e instanceof IntegrationHttpError ? e.status : null
    return { ...base, needsReconnect: status === 401, reposUnavailable: true }
  }
}

export interface TestResult {
  ok: boolean
  message: string
}

/** "Test": the token works (refreshing it if due) and the app installation is visible. */
export async function testGitHub(userId: string, now: Date = new Date()): Promise<TestResult> {
  if (!(await consumeRateLimit(userId, 'github_test', RATE_RULES.test, now))) return { ok: false, message: 'Too many tests. Please wait a few minutes.' }
  const token = await getGitHubUserToken(userId, now)
  if (!token.ok) {
    const messages = {
      not_configured: 'GitHub is not configured on this deployment yet.',
      not_connected: 'Connect GitHub first.',
      expired: 'The GitHub authorization has expired or was revoked. Connect again.',
      network: 'Could not reach GitHub.',
    } as const
    return { ok: false, message: messages[token.reason] }
  }
  try {
    const user = await getUser(token.cfg, token.token)
    const installation = await findInstallation(token.cfg, token.token)
    return installation
      ? { ok: true, message: `Connected as ${user.login}; the app is installed.` }
      : { ok: true, message: `Connected as ${user.login}. Install the app on your portfolio repository to publish with it.` }
  } catch (e) {
    const status = e instanceof IntegrationHttpError ? e.status : null
    return { ok: false, message: status === 401 ? 'GitHub rejected the token. Connect again.' : 'GitHub did not answer the test.' }
  }
}

export interface DisconnectResult {
  ok: boolean
  revoked: boolean
  error?: string
}

/**
 * Revoke the authorization at GitHub (best effort: a network failure still
 * removes everything locally, and says so), then delete the tokens and the
 * cached repo stats.
 */
export async function disconnectGitHub(userId: string, now: Date = new Date()): Promise<DisconnectResult> {
  if (!(await consumeRateLimit(userId, 'github_disconnect', RATE_RULES.disconnect, now))) {
    return { ok: false, revoked: false, error: 'Too many attempts. Please wait a few minutes.' }
  }
  const cfg = githubAppConfig()
  const tokens = await connQ.getTokens(userId, 'github')
  let revoked = false
  if (cfg.ok && tokens) {
    try {
      revoked = await revokeGrant(cfg.config, tokens.access)
    } catch {
      revoked = false
    }
  }
  await connQ.remove(userId, 'github')
  await statsQ.removeAll(userId)
  logger.info('github_disconnected', { userId, revoked })
  return { ok: true, revoked }
}

export { GITHUB_APP_ENV }
