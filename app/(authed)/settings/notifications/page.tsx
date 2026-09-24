import { and, eq } from 'drizzle-orm'
import { requireUserId } from '@/lib/auth/require-session'
import { db } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { getProfile } from '@/lib/profile/service'
import { NotificationsPanel } from '@/components/notifications-panel'
import { PageHeader } from '@/components/page-header'

export const dynamic = 'force-dynamic'

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'

export default async function NotificationsSettingsPage() {
  const userId = await requireUserId()
  const [profile, account] = await Promise.all([
    getProfile(userId),
    db.query.accounts.findFirst({
      where: and(eq(accounts.userId, userId), eq(accounts.provider, 'google')),
    }),
  ])

  // Space-delimited by Google. Empty when the row is missing or scope column is
  // null on legacy sign-ins.
  const scopes = account?.scope?.split(' ').filter(Boolean) ?? []
  const hasGmailSendScope = scopes.includes(GMAIL_SEND_SCOPE)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Notifications"
        description="Weekly digest email delivered from your own Gmail."
      />
      <NotificationsPanel
        weeklyDigestEnabled={profile?.weeklyDigestEnabled ?? true}
        lastSentAt={profile?.digestLastSentAt?.toISOString() ?? null}
        hasGmailSendScope={hasGmailSendScope}
      />
    </div>
  )
}
