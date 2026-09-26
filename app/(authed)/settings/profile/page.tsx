import { requireUserId } from '@/lib/auth/require-session'
import { getProfile } from '@/lib/profile/service'
import { PageHeader } from '@/components/page-header'
import { ProfileForm } from '@/components/profile-form'
import { ProfileImport } from '@/components/profile-import'
import { APP_NAME } from '@/lib/brand'

export const dynamic = 'force-dynamic'

export default async function ProfileSettingsPage() {
  const userId = await requireUserId()
  const profile = await getProfile(userId)
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Profile"
        description={`What ${APP_NAME} knows about you — used to tailor matching, discovery, and CV generation.`}
      />
      <ProfileImport />
      <ProfileForm profile={profile} />
    </div>
  )
}
