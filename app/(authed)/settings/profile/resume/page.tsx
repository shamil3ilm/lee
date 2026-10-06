import { requireUserId } from '@/lib/auth/require-session'
import { getResumeProfile } from '@/lib/resume/service'
import { PageHeader } from '@/components/page-header'
import { ResumeEditor } from '@/components/resume/resume-editor'

export const dynamic = 'force-dynamic'

export default async function ResumeSettingsPage() {
  const userId = await requireUserId()
  const { profile, stored } = await getResumeProfile(userId)
  return (
    <div className="space-y-6">
      <PageHeader
        title="Résumé"
        description="Your master profile: the one source of facts for every CV, variant and the portfolio. Variants choose from it; Publish sends only what you mark public."
      />
      <ResumeEditor initial={profile} stored={stored} />
    </div>
  )
}
