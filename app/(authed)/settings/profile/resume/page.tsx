import { requireUserId } from '@/lib/auth/require-session'
import { getProfilePhoto } from '@/lib/resume/photo-store'
import { getResumeProfile } from '@/lib/resume/service'
import { PageHeader } from '@/components/page-header'
import { PhotoCard } from '@/components/resume/photo-card'
import { ResumeEditor } from '@/components/resume/resume-editor'

export const dynamic = 'force-dynamic'

export default async function ResumeSettingsPage() {
  const userId = await requireUserId()
  const [{ profile, stored }, photo] = await Promise.all([getResumeProfile(userId), getProfilePhoto(userId)])
  return (
    <div className="space-y-6">
      <PageHeader
        title="Résumé"
        description="Your master profile: the one source of facts for every CV, variant and the portfolio. Variants choose from it; Publish sends only what you mark public."
      />
      <PhotoCard photoVersion={photo?.sha256 ?? null} />
      <ResumeEditor initial={profile} stored={stored} />
    </div>
  )
}
