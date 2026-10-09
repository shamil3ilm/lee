import * as connQ from '@/lib/db/queries/integrationConnections'
import { logger } from '@/lib/logger'
import { PORTFOLIO_TOKEN_ID, type RepoTarget } from '@/lib/portfolio/config'
import { resolveServiceSecret } from '@/lib/settings/secrets'
import { githubAppConfig } from '../config'
import { IntegrationHttpError } from '../http'
import { createInstallationToken } from './api'

/**
 * SERVER-ONLY. The token Publish writes profile.json with:
 *
 *   1. Connect GitHub (preferred): a 1-hour installation token for the
 *      user's OWN app installation (found with their user token at connect
 *      time, on the account that owns the configured repository), narrowed
 *      to that one repository with
 *      Contents: write + Metadata: read. GitHub refuses a repository the
 *      installation was not granted, and then…
 *   2. …the existing fine-grained token (service key `github_portfolio`).
 *
 * The sha/conflict flow in lib/portfolio/publish.ts is the same for both.
 */

export type PortfolioTokenVia = 'app' | 'token'

export interface PortfolioToken {
  token: string
  via: PortfolioTokenVia
}

export async function resolvePortfolioToken(userId: string, target: RepoTarget, now: Date = new Date()): Promise<PortfolioToken | null> {
  const viaApp = await appToken(userId, target, now)
  if (viaApp) return { token: viaApp, via: 'app' }
  const { key } = await resolveServiceSecret(userId, PORTFOLIO_TOKEN_ID)
  return key ? { token: key, via: 'token' } : null
}

async function appToken(userId: string, target: RepoTarget, now: Date): Promise<string | null> {
  const cfg = githubAppConfig()
  if (!cfg.ok) return null
  const conn = await connQ.get(userId, 'github')
  if (!conn?.installationId) return null
  // Only the installation on the repository owner's account: an org
  // installation the user can merely see must never mint a write token for
  // that org's repositories.
  const account = typeof conn.settings.installationAccount === 'string' ? conn.settings.installationAccount : null
  if (!account || account.toLowerCase() !== target.owner.toLowerCase()) return null
  try {
    return await createInstallationToken(cfg.config, conn.installationId, target.repo, { contents: 'write', metadata: 'read' }, now)
  } catch (e) {
    logger.warn('github_installation_token_failed', { userId, status: e instanceof IntegrationHttpError ? e.status : null })
    return null
  }
}
