import { requireUserId } from '@/lib/auth/require-session'
import { getProfile } from '@/lib/profile/service'
import { PageHeader } from '@/components/page-header'
import { SearchPrefsForm } from '@/components/search-prefs/search-prefs-form'
import { RoleSuggestions } from '@/components/search-prefs/role-suggestions'
import { loadRoleSuggestions } from '@/lib/discovery/relevance/service'
import { searchPrefsFormValues } from '@/lib/discovery/relevance/view'
import { ReturnLink } from '@/components/settings/return-link'

export const dynamic = 'force-dynamic'

/**
 * Settings › Search: what Discovery keeps and how it ranks (target roles,
 * seniority, work mode, places, rules, pay, languages), plus role
 * suggestions from the profile. The one place these are edited.
 */
export default async function SearchSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const userId = await requireUserId()
  const [profile, sp] = await Promise.all([getProfile(userId), searchParams])
  const suggestions = await loadRoleSuggestions(userId, profile)
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <ReturnLink from={sp.from} />
      <PageHeader
        title="Search preferences"
        description="What you're looking for. Discovery filters only clear mismatches, always with the reason, and ranks the rest."
      />
      <SearchPrefsForm values={searchPrefsFormValues(profile)} />
      <RoleSuggestions result={suggestions} />
    </div>
  )
}
