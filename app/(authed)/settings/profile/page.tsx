import { requireUserId } from '@/lib/auth/require-session'
import { getProfile } from '@/lib/profile/service'
import { ProfileForm } from '@/components/profile-form'
import { ProfileImport } from '@/components/profile-import'

export const dynamic = 'force-dynamic'

export default async function ProfileSettingsPage() {
  const userId = await requireUserId()
  const profile = await getProfile(userId)
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">Profile</h1>
      <ProfileImport />
      <ProfileForm profile={profile} />
    </div>
  )
}
