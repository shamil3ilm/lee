import { requireUserId } from '@/lib/auth/require-session'
import { getProfile } from '@/lib/profile/service'
import { PageHeader } from '@/components/page-header'
import { ProfileForm } from '@/components/profile-form'
import { ProfileImport } from '@/components/profile-import'
import { SearchPrefsForm } from '@/components/search-prefs/search-prefs-form'
import { RoleSuggestions } from '@/components/search-prefs/role-suggestions'
import { loadRoleSuggestions } from '@/lib/discovery/relevance/service'
import { searchPrefsFormValues } from '@/lib/discovery/relevance/view'
import { APP_NAME } from '@/lib/brand'

export const dynamic = 'force-dynamic'

export default async function ProfileSettingsPage() {
  const userId = await requireUserId()
  const profile = await getProfile(userId)
  const suggestions = await loadRoleSuggestions(userId, profile)
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Profile"
        description={`What ${APP_NAME} knows about you — used to tailor matching, discovery, and CV generation.`}
      />
      <ProfileImport />
      <SearchPrefsForm values={searchPrefsFormValues(profile)} />
      <RoleSuggestions result={suggestions} />
      <ProfileForm profile={profile} />
    </div>
  )
}
