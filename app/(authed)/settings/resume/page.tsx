import { requireUserId } from '@/lib/auth/require-session'
import { getProfilePhoto } from '@/lib/resume/photo-store'
import { getResumeProfile } from '@/lib/resume/service'
import { PageHeader } from '@/components/page-header'
import { PhotoCard } from '@/components/resume/photo-card'
import { ResumeEditor } from '@/components/resume/resume-editor'
import { SectionNav, SECTION_ANCHOR } from '@/components/section-nav'
import { ReturnLink } from '@/components/settings/return-link'
import { GitHubEvidencePanel, type RepoRow } from '@/components/resume/github-evidence-panel'
import * as connQ from '@/lib/db/queries/integrationConnections'
import * as statsQ from '@/lib/db/queries/githubRepoStats'

export const dynamic = 'force-dynamic'

const SECTIONS = [
  { id: 'resume-photo', label: 'Photo' },
  { id: 'resume-basics', label: 'Basics' },
  { id: 'resume-work', label: 'Work' },
  { id: 'resume-projects', label: 'Projects' },
  { id: 'resume-skills', label: 'Skills' },
  { id: 'resume-education', label: 'Education' },
  { id: 'resume-portfolio', label: 'Portfolio' },
  { id: 'resume-github', label: 'From GitHub' },
]

export default async function ResumeSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const userId = await requireUserId()
  const [{ profile, stored }, photo, sp, github, stats] = await Promise.all([
    getResumeProfile(userId),
    getProfilePhoto(userId),
    searchParams,
    connQ.get(userId, 'github'),
    statsQ.list(userId),
  ])
  const repos: RepoRow[] = stats.map((r) => ({
    fullName: r.fullName,
    htmlUrl: r.htmlUrl,
    isPrivate: r.isPrivate,
    description: r.description,
    topics: r.topics,
    languages: r.languages,
    stars: r.stars,
    lastCommitAt: r.lastCommitAt?.toISOString() ?? null,
    userCommits: r.userCommits,
    userPrs: r.userPrs,
    linkedProjectId: r.linkedProjectId,
    followDeps: r.followDeps,
  }))
  return (
    <div className="space-y-6">
      <ReturnLink from={sp.from} />
      <PageHeader
        title="Résumé"
        description="Your master profile: the one source of facts for every CV, variant and the portfolio. Variants choose from it; Publish sends only what you mark public."
      />
      <SectionNav sections={SECTIONS} />
      <div id="resume-photo" className={SECTION_ANCHOR}>
        <PhotoCard photoVersion={photo?.sha256 ?? null} />
      </div>
      <ResumeEditor initial={profile} stored={stored} />
      <GitHubEvidencePanel connected={github !== null} repos={repos} projects={profile.projects} />
    </div>
  )
}
