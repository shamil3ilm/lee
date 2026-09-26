import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { accounts, userProfile } from '@/lib/db/schema'
import { hasDriveScope } from './scope'

export interface DriveConnection {
  /** A Google account row exists (the E2E test user has none). */
  hasGoogleAccount: boolean
  /** drive.file granted and a refresh token stored. */
  connected: boolean
  /** Settings › Integrations toggle: store new files in Drive. */
  enabled: boolean
}

/** Drive state for a user: two tiny indexed reads, no tokens returned. */
export async function getDriveConnection(userId: string): Promise<DriveConnection> {
  const [[account], [profile]] = await Promise.all([
    db
      .select({
        scope: accounts.scope,
        hasRefresh: sql<boolean>`${accounts.refresh_token} is not null`,
      })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.provider, 'google')))
      .limit(1),
    db
      .select({ enabled: userProfile.driveStorageEnabled })
      .from(userProfile)
      .where(eq(userProfile.userId, userId))
      .limit(1),
  ])
  return {
    hasGoogleAccount: !!account,
    connected: !!account && Boolean(account.hasRefresh) && hasDriveScope(account.scope),
    // No profile row yet → the column default (on).
    enabled: profile?.enabled ?? true,
  }
}

/** True when new files for this user should go to Drive. */
export function usesDrive(c: DriveConnection): boolean {
  return c.connected && c.enabled
}
