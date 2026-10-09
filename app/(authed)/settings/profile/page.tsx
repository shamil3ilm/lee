import { requireUserId } from '@/lib/auth/require-session'
import { getProfile } from '@/lib/profile/service'
import { PageHeader } from '@/components/page-header'
import { ProfileForm } from '@/components/profile-form'
import { ProfileImport } from '@/components/profile-import'
import { APP_NAME } from '@/lib/brand'
import { ProfileLinksCard } from '@/components/profile/profile-links-card'
import { UrlImportCard } from '@/components/profile/url-import-card'
import { readProfileLinks } from '@/lib/profile/links'
import { SectionNav, SECTION_ANCHOR } from '@/components/section-nav'
import { ReturnLink } from '@/components/settings/return-link'
import { PortfolioSyncCard } from '@/components/portfolio/sync-card'
import { pullOnOpen } from '@/lib/portfolio/pull'
import { loadSyncStatus } from '@/lib/portfolio/sync-status'
import { ResetPanel } from '@/components/profile/reset/reset-panel'
import { lastUndoableImport } from '@/lib/import/undo'
import { batchViews, resetCounts } from '@/lib/reset/plan'
import { loadResetState } from '@/lib/reset/state'

export const dynamic = 'force-dynamic'

const SECTIONS = [
  { id: 'cv-import', label: 'Import CV' },
  { id: 'url-import', label: 'Import from a link' },
  { id: 'profile-links', label: 'Links' },
  { id: 'portfolio-sync', label: 'Portfolio' },
  { id: 'profile-details', label: 'Details' },
  { id: 'reset-details', label: 'Reset' },
]

/**
 * Settings › Profile: who you are (imports, links, basics, skills,
 * narrative). What you are looking for lives in Settings › Search.
 */
export default async function ProfileSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const userId = await requireUserId()
  // The portfolio is the source of the public profile: pull it first (throttled).
  await pullOnOpen(userId)
  const [profile, sp, sync, reset, last] = await Promise.all([
    getProfile(userId),
    searchParams,
    loadSyncStatus(userId),
    loadResetState(userId),
    lastUndoableImport(userId),
  ])
  const batches = batchViews(reset)
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <ReturnLink from={sp.from} />
      <PageHeader
        title="Profile"
        description={`What ${APP_NAME} knows about you, used for matching, CV generation and outreach. What you're looking for is under Search.`}
      />
      <SectionNav sections={SECTIONS} />
      <div id="cv-import" className={SECTION_ANCHOR}>
        <ProfileImport />
      </div>
      <UrlImportCard />
      <ProfileLinksCard initial={readProfileLinks(profile?.links)} />
      <div id="portfolio-sync" className={SECTION_ANCHOR}>
        <PortfolioSyncCard status={sync} />
      </div>
      <div id="profile-details" className={SECTION_ANCHOR}>
        <ProfileForm profile={profile} />
      </div>
      <ResetPanel
        counts={resetCounts(reset)}
        batches={batches}
        lastImport={batches.find((b) => b.id === last?.id) ?? null}
        editable={reset.editable}
      />
    </div>
  )
}
