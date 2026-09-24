import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { requireUserId } from '@/lib/auth/require-session'
import { db } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { getProfile } from '@/lib/profile/service'
import { IntegrationsPanel } from '@/components/integrations-panel'
import { PageHeader } from '@/components/page-header'

export const dynamic = 'force-dynamic'

export default async function IntegrationsSettingsPage() {
  const userId = await requireUserId()
  const session = await auth()
  const [account, profile] = await Promise.all([
    db.query.accounts.findFirst({
      where: and(eq(accounts.userId, userId), eq(accounts.provider, 'google')),
    }),
    getProfile(userId),
  ])
  // Google returns granted scopes space-delimited in the `scope` column. Some
  // very old signins left it null; treat that as no scopes so the UI prompts
  // for a reconnect rather than crashing.
  const scopes = account?.scope?.split(' ').filter(Boolean) ?? []

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Integrations"
        description="Google account access for Gmail sync and Calendar events."
      />
      <IntegrationsPanel
        email={session?.user?.email ?? null}
        scopes={scopes}
        syncedGmailAt={profile?.syncedGmailAt?.toISOString() ?? null}
        syncedCalendarAt={profile?.syncedCalendarAt?.toISOString() ?? null}
      />
    </div>
  )
}
