import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { integrationConnections } from '@/lib/db/schema'
import { decryptToken, encryptToken } from '@/lib/crypto/token-vault'
import type { IntegrationProvider } from '@/lib/integrations/config'

/**
 * Per-user provider connections (Connect GitHub / LinkedIn). Tokens are
 * stored encrypted with the token vault (lib/crypto/token-vault.ts) and only
 * `getTokens` decrypts them — server-only, never returned from an action
 * or route. Every function is scoped by user id: there is no lookup by
 * provider account and no fallback to another user's (the owner's) row.
 */

export interface TokenPair {
  access: string
  refresh: string | null
}

export interface ConnectionInput {
  accountId: string
  login: string | null
  displayName: string | null
  email: string | null
  avatarUrl: string | null
  scopes: readonly string[]
  tokens: TokenPair
  accessExpiresAt: Date | null
  refreshExpiresAt: Date | null
  installationId?: string | null
  settings?: Record<string, unknown>
}

/** Everything but the ciphertext: safe to hand to the settings page. */
export interface ConnectionView {
  provider: IntegrationProvider
  accountId: string
  login: string | null
  displayName: string | null
  email: string | null
  avatarUrl: string | null
  scopes: string[]
  accessExpiresAt: Date | null
  refreshExpiresAt: Date | null
  installationId: string | null
  settings: Record<string, unknown>
  connectedAt: Date
}

export interface StoredTokens extends TokenPair {
  accessExpiresAt: Date | null
  refreshExpiresAt: Date | null
}

function encryptTokens(tokens: TokenPair): { tokens: string } {
  return { tokens: encryptToken(JSON.stringify({ access: tokens.access, refresh: tokens.refresh })) }
}

export async function save(userId: string, provider: IntegrationProvider, input: ConnectionInput): Promise<void> {
  const values = {
    accountId: input.accountId,
    login: input.login,
    displayName: input.displayName,
    email: input.email,
    avatarUrl: input.avatarUrl,
    scopes: [...input.scopes],
    ...encryptTokens(input.tokens),
    accessExpiresAt: input.accessExpiresAt,
    refreshExpiresAt: input.refreshExpiresAt,
    installationId: input.installationId ?? null,
    settings: input.settings ?? {},
  }
  await db
    .insert(integrationConnections)
    .values({ userId, provider, ...values })
    .onConflictDoUpdate({
      target: [integrationConnections.userId, integrationConnections.provider],
      set: { ...values, connectedAt: sql`now()`, updatedAt: sql`now()` },
    })
}

export async function get(userId: string, provider: IntegrationProvider): Promise<ConnectionView | null> {
  const [row] = await db
    .select({
      accountId: integrationConnections.accountId,
      login: integrationConnections.login,
      displayName: integrationConnections.displayName,
      email: integrationConnections.email,
      avatarUrl: integrationConnections.avatarUrl,
      scopes: integrationConnections.scopes,
      accessExpiresAt: integrationConnections.accessExpiresAt,
      refreshExpiresAt: integrationConnections.refreshExpiresAt,
      installationId: integrationConnections.installationId,
      settings: integrationConnections.settings,
      connectedAt: integrationConnections.connectedAt,
    })
    .from(integrationConnections)
    .where(and(eq(integrationConnections.userId, userId), eq(integrationConnections.provider, provider)))
    .limit(1)
  return row ? { provider, ...row } : null
}

/** SERVER-ONLY. Decrypted tokens, or null (none stored, or undecryptable after an AUTH_SECRET rotation). */
export async function getTokens(userId: string, provider: IntegrationProvider): Promise<StoredTokens | null> {
  const [row] = await db
    .select()
    .from(integrationConnections)
    .where(and(eq(integrationConnections.userId, userId), eq(integrationConnections.provider, provider)))
    .limit(1)
  if (!row) return null
  try {
    const pair = JSON.parse(decryptToken(row.tokens)) as TokenPair
    if (typeof pair.access !== 'string' || !pair.access) return null
    return {
      access: pair.access,
      refresh: typeof pair.refresh === 'string' && pair.refresh ? pair.refresh : null,
      accessExpiresAt: row.accessExpiresAt,
      refreshExpiresAt: row.refreshExpiresAt,
    }
  } catch {
    return null
  }
}

/** Replace the tokens after a refresh (the old refresh token is now invalid). */
export async function updateTokens(
  userId: string,
  provider: IntegrationProvider,
  tokens: TokenPair,
  accessExpiresAt: Date | null,
  refreshExpiresAt: Date | null,
): Promise<void> {
  await db
    .update(integrationConnections)
    .set({ ...encryptTokens(tokens), accessExpiresAt, refreshExpiresAt, updatedAt: sql`now()` })
    .where(and(eq(integrationConnections.userId, userId), eq(integrationConnections.provider, provider)))
}

export async function updateMeta(
  userId: string,
  provider: IntegrationProvider,
  patch: { installationId?: string | null; settings?: Record<string, unknown> },
): Promise<void> {
  const current = await get(userId, provider)
  if (!current) return
  await db
    .update(integrationConnections)
    .set({
      ...(patch.installationId !== undefined ? { installationId: patch.installationId } : {}),
      ...(patch.settings ? { settings: { ...current.settings, ...patch.settings } } : {}),
      updatedAt: sql`now()`,
    })
    .where(and(eq(integrationConnections.userId, userId), eq(integrationConnections.provider, provider)))
}

export async function remove(userId: string, provider: IntegrationProvider): Promise<boolean> {
  const rows = await db
    .delete(integrationConnections)
    .where(and(eq(integrationConnections.userId, userId), eq(integrationConnections.provider, provider)))
    .returning()
  return rows.length > 0
}
