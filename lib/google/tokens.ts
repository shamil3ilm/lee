import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { env } from '@/lib/env'
import { fetchWithTimeout, GOOGLE_TOKEN_TIMEOUT_MS } from '@/lib/net/timeout'

/**
 * Raised when a user has not linked a Google account (or has linked one but
 * never authorized the refresh flow). Callers should treat this as an expected
 * condition — most background jobs (Gmail sync, cron) should catch and skip
 * silently rather than surface an error.
 */
export class NoGoogleAccountError extends Error {
  constructor(message = 'No Google account linked') {
    super(message)
    this.name = 'NoGoogleAccountError'
  }
}

/**
 * Raised when Google rejects the stored refresh token (`invalid_grant`): the
 * user revoked access, or the grant expired. Only a new consent fixes it, so
 * callers show "Reconnect" rather than retrying.
 */
export class GoogleGrantRevokedError extends Error {
  constructor(message = 'Google access was revoked or has expired') {
    super(message)
    this.name = 'GoogleGrantRevokedError'
  }
}

/** True when a token-endpoint error body is an OAuth `invalid_grant`. */
function isInvalidGrant(status: number, detail: string): boolean {
  return status === 400 && /invalid_grant/.test(detail)
}

export interface GoogleTokens {
  accessToken: string
  refreshToken: string
  /** Unix seconds when accessToken expires. */
  expiresAt: number
}

interface RefreshResponse {
  access_token: string
  expires_in: number
  token_type?: string
  scope?: string
}

/**
 * Read Google OAuth tokens for `userId` from the accounts table. If the stored
 * access_token is expired (or expires within the next 60s to avoid clock-skew
 * flakes), refresh it via Google's OAuth token endpoint, persist the new
 * access_token + expires_at, and return the fresh tokens.
 *
 * Throws NoGoogleAccountError when no Google row exists or when the row is
 * missing a refresh_token (typically a stale pre-v3 signin that granted only
 * openid/email scope — user must re-authorize).
 */
export async function getGoogleTokens(userId: string): Promise<GoogleTokens> {
  const row = await db.query.accounts.findFirst({
    where: and(eq(accounts.userId, userId), eq(accounts.provider, 'google')),
  })
  if (!row?.access_token || !row.refresh_token) {
    throw new NoGoogleAccountError('No Google account linked')
  }
  const nowSec = Math.floor(Date.now() / 1000)
  // Only reuse the stored access_token if it lives at least another 60s. This
  // small buffer prevents a race where the token appears fresh here but
  // expires between the check and the downstream API call.
  if (row.expires_at && row.expires_at > nowSec + 60) {
    return {
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      expiresAt: row.expires_at,
    }
  }

  const res = await fetchWithTimeout(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.AUTH_GOOGLE_ID,
        client_secret: env.AUTH_GOOGLE_SECRET,
        grant_type: 'refresh_token',
        refresh_token: row.refresh_token,
      }),
    },
    { timeoutMs: GOOGLE_TOKEN_TIMEOUT_MS, label: 'google token refresh' },
  )
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    if (isInvalidGrant(res.status, detail)) throw new GoogleGrantRevokedError()
    throw new Error(`google token refresh failed: ${res.status} ${detail}`)
  }
  const json = (await res.json()) as RefreshResponse
  const newExpires = nowSec + json.expires_in

  await db
    .update(accounts)
    .set({ access_token: json.access_token, expires_at: newExpires })
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, 'google')))

  return {
    accessToken: json.access_token,
    refreshToken: row.refresh_token,
    expiresAt: newExpires,
  }
}

/**
 * Mint a fresh access token limited to `scope` (a subset of what the user
 * granted) from the stored refresh token, per RFC 6749 §6. Used to hand the
 * browser a short-lived, narrow token (e.g. drive.file for the Google
 * Picker) without exposing the refresh token or the Gmail/Calendar scopes.
 * The token is not persisted. Throws if Google returns any broader scope.
 */
export async function mintScopedAccessToken(
  userId: string,
  scope: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const row = await db.query.accounts.findFirst({
    columns: { refresh_token: true },
    where: and(eq(accounts.userId, userId), eq(accounts.provider, 'google')),
  })
  if (!row?.refresh_token) throw new NoGoogleAccountError('No Google account linked')
  const res = await fetchWithTimeout(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.AUTH_GOOGLE_ID,
        client_secret: env.AUTH_GOOGLE_SECRET,
        grant_type: 'refresh_token',
        refresh_token: row.refresh_token,
        scope,
      }),
    },
    { timeoutMs: GOOGLE_TOKEN_TIMEOUT_MS, label: 'google scoped token' },
  )
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    if (isInvalidGrant(res.status, detail)) throw new GoogleGrantRevokedError()
    throw new Error(`google scoped token failed: ${res.status}`)
  }
  const json = (await res.json()) as RefreshResponse
  const granted = (json.scope ?? '').split(' ').filter(Boolean)
  if (!json.access_token || granted.length === 0 || granted.some((s) => s !== scope)) {
    // Never hand the browser a token broader than asked for.
    throw new Error('google scoped token: unexpected scope set')
  }
  return { accessToken: json.access_token, expiresIn: json.expires_in }
}
