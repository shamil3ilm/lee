import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { requireUserId } from '@/lib/auth/require-session'
import { db } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { getProfile } from '@/lib/profile/service'
import * as assetsQ from '@/lib/db/queries/documentAssets'
import { getDriveConnection } from '@/lib/drive/connection'
import { ASSET_QUOTA_BYTES } from '@/lib/storage/types'
import { IntegrationsPanel } from '@/components/integrations-panel'
import { DriveStorageCard } from '@/components/drive/drive-storage-card'
import { PageHeader } from '@/components/page-header'

export const dynamic = 'force-dynamic'
// "Move existing files to Drive" runs as a server action on this page.
export const maxDuration = 30

export default async function IntegrationsSettingsPage() {
  const userId = await requireUserId()
  const session = await auth()
  const [account, profile, drive, postgresBytes, driveBytes, pendingFiles] = await Promise.all([
    db.query.accounts.findFirst({
      where: and(eq(accounts.userId, userId), eq(accounts.provider, 'google')),
    }),
    getProfile(userId),
    getDriveConnection(userId),
    assetsQ.totalBytes(userId),
    assetsQ.driveTotalBytes(userId),
    assetsQ.countPostgresHeld(userId),
  ])
  // Google returns granted scopes space-delimited in the `scope` column. Some
  // very old signins left it null; treat that as no scopes so the UI prompts
  // for a reconnect rather than crashing.
  const scopes = account?.scope?.split(' ').filter(Boolean) ?? []

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Integrations"
        description="Google account access for Gmail sync, Calendar events and Drive file storage."
      />
      <IntegrationsPanel
        email={session?.user?.email ?? null}
        scopes={scopes}
        syncedGmailAt={profile?.syncedGmailAt?.toISOString() ?? null}
        syncedCalendarAt={profile?.syncedCalendarAt?.toISOString() ?? null}
      />
      <DriveStorageCard
        hasGoogleAccount={drive.hasGoogleAccount}
        connected={drive.connected}
        enabled={drive.enabled}
        postgresBytes={postgresBytes}
        quotaBytes={ASSET_QUOTA_BYTES}
        driveBytes={driveBytes}
        pendingFiles={pendingFiles}
      />
    </div>
  )
}
