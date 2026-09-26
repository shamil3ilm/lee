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
