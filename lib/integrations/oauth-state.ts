import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { and, eq, lt } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { oauthStates } from '@/lib/db/schema'
import { decryptToken, encryptToken } from '@/lib/crypto/token-vault'
import type { IntegrationProvider } from './config'

/**
 * SERVER-ONLY. OAuth `state` (CSRF), PKCE and OIDC nonce handling.
 *
 * A connect attempt creates one random state. It is:
 *   - sent to the provider in the authorize URL,
 *   - set as an httpOnly cookie scoped to the callback path, and
 *   - stored hashed with the user id, provider, expiry and the encrypted
 *     PKCE verifier / nonce.
 * The callback accepts it only when the query state equals the cookie
 * (same browser), the row exists for THIS signed-in user and provider and
 * has not expired. The row is deleted on first use (single use).
 */

export const STATE_TTL_MS = 10 * 60_000

export interface StateSecrets {
  codeVerifier?: string
  nonce?: string
}

export type StateFailure = 'missing' | 'mismatch' | 'unknown' | 'expired'

function b64url(buf: Buffer): string {
  return buf.toString('base64url')
}

export function hashState(state: string): string {
  return createHash('sha256').update(state).digest('hex')
}

export function randomToken(bytes = 32): string {
  return b64url(randomBytes(bytes))
}

/** RFC 7636 S256: BASE64URL(SHA256(verifier)). */
export function pkceChallenge(verifier: string): string {
  return b64url(createHash('sha256').update(verifier).digest())
}

export function stateCookieName(provider: IntegrationProvider): string {
  return `lee_oauth_${provider}`
}

export function stateCookieOptions(provider: IntegrationProvider, env: Readonly<Record<string, string | undefined>> = process.env) {
  return {
    httpOnly: true,
    // The provider redirects back with a top-level GET: Lax cookies are sent.
    sameSite: 'lax' as const,
    secure: env.NODE_ENV === 'production',
    path: `/api/integrations/${provider}`,
    maxAge: STATE_TTL_MS / 1000,
  }
}

export async function createOAuthState(
  userId: string,
  provider: IntegrationProvider,
  secrets: StateSecrets,
  now: Date = new Date(),
): Promise<string> {
  const state = randomToken()
  // Housekeeping: this user's abandoned attempts.
  await db.delete(oauthStates).where(and(eq(oauthStates.userId, userId), lt(oauthStates.expiresAt, now)))
  await db.insert(oauthStates).values({
    stateHash: hashState(state),
    userId,
    provider,
    secret: encryptToken(JSON.stringify(secrets)),
    createdAt: now,
    expiresAt: new Date(now.getTime() + STATE_TTL_MS),
  })
  return state
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Validate and burn a state. Never throws on bad input. */
export async function consumeOAuthState(
  userId: string,
  provider: IntegrationProvider,
  state: string | null,
  cookieState: string | null,
  now: Date = new Date(),
): Promise<{ ok: true; secrets: StateSecrets } | { ok: false; reason: StateFailure }> {
  if (!state || !cookieState || state.length > 200) return { ok: false, reason: 'missing' }
  if (!sameString(state, cookieState)) return { ok: false, reason: 'mismatch' }
  const [row] = await db
    .delete(oauthStates)
    .where(and(eq(oauthStates.stateHash, hashState(state)), eq(oauthStates.userId, userId), eq(oauthStates.provider, provider)))
    .returning()
  if (!row) return { ok: false, reason: 'unknown' }
  if (row.expiresAt.getTime() < now.getTime()) return { ok: false, reason: 'expired' }
  try {
    const secrets = JSON.parse(decryptToken(row.secret)) as StateSecrets
    return { ok: true, secrets }
  } catch {
    return { ok: false, reason: 'unknown' }
  }
}
