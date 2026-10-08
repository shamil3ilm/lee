import { requireUserId } from '@/lib/auth/require-session'
import { getResumeProfile } from '@/lib/resume/service'
import { studyList } from '@/lib/resume/study'
import { PageHeader } from '@/components/page-header'
import { StudyList } from '@/components/resume/study-list'

export const dynamic = 'force-dynamic'

export default async function StudyListPage() {
  const userId = await requireUserId()
  const { profile } = await getResumeProfile(userId)
  return (
    <div className="space-y-6">
      <PageHeader
        title="Study list"
        description="AI-assisted and still-learning items. They stay out of variants and tailored CVs until you mark them ready; owning only the design lets them in as design work."
      />
      <StudyList items={studyList(profile)} />
    </div>
  )
}
