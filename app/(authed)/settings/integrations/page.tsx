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
import { PlacesSettingsCard } from '@/components/reputation/places-settings-card'
import * as repSettingsQ from '@/lib/db/queries/reputationSettings'
import { PLACES_HARD_MONTHLY_CAP } from '@/lib/reputation/places'
import { listServiceSecretStatuses } from '@/lib/settings/secrets'
import { latestUserEvent, type EventView } from '@/lib/logs/queries'
import type { LastActivityItem } from '@/components/settings/last-activity'

function activity(e: EventView | null): LastActivityItem | null {
  return e ? { at: e.createdAt.toISOString(), message: e.message, level: e.level } : null
}

const CALENDAR_EVENTS = ['calendar_event_pushed', 'calendar_event_updated', 'calendar_event_removed', 'calendar_op_failed']
const DRIVE_EVENTS = ['drive_migrate_done', 'drive_api_error', 'drive_fetch_failed', 'drive_migrate_failed']

export const dynamic = 'force-dynamic'
// "Move existing files to Drive" runs as a server action on this page.
export const maxDuration = 30

export default async function IntegrationsSettingsPage() {
  const userId = await requireUserId()
  const session = await auth()
  const [
    account,
    profile,
    drive,
    postgresBytes,
    driveBytes,
    pendingFiles,
    gmailLast,
    calendarLast,
    driveLast,
    places,
    secrets,
  ] = await Promise.all([
    db.query.accounts.findFirst({
      where: and(eq(accounts.userId, userId), eq(accounts.provider, 'google')),
    }),
    getProfile(userId),
    getDriveConnection(userId),
    assetsQ.totalBytes(userId),
    assetsQ.driveTotalBytes(userId),
    assetsQ.countPostgresHeld(userId),
    // One LIMIT 1 query each on (user_id, created_at desc).
    latestUserEvent(userId, 'gmail', ['gmail_sync_done', 'gmail_sync_thread_failed']),
    latestUserEvent(userId, 'calendar', CALENDAR_EVENTS),
    latestUserEvent(userId, 'drive', DRIVE_EVENTS),
    repSettingsQ.get(userId),
    listServiceSecretStatuses(userId),
  ])
  const month = new Date().toISOString().slice(0, 7)
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
        gmailActivity={activity(gmailLast)}
        calendarActivity={activity(calendarLast)}
      />
      <DriveStorageCard
        hasGoogleAccount={drive.hasGoogleAccount}
        connected={drive.connected}
        enabled={drive.enabled}
        postgresBytes={postgresBytes}
        quotaBytes={ASSET_QUOTA_BYTES}
        driveBytes={driveBytes}
        pendingFiles={pendingFiles}
        lastActivity={activity(driveLast)}
      />
      <PlacesSettingsCard
        enabled={places.placesEnabled}
        cap={places.placesMonthlyCap}
        hardCap={PLACES_HARD_MONTHLY_CAP}
        usedThisMonth={places.placesMonth === month ? places.placesCalls : 0}
        hasKey={secrets.some((s) => s.info.id === 'google_places' && s.source !== 'none')}
      />
    </div>
  )
}
