import { requireUserId } from '@/lib/auth/require-session'
import { getMasterCV, bootstrapFromProfile } from '@/lib/documents/master'
import * as documentsQ from '@/lib/db/queries/documents'
import { PageHeader } from '@/components/page-header'
import { CvEditor } from '@/components/cv-editor'

export const dynamic = 'force-dynamic'

export default async function CvSettingsPage() {
  const userId = await requireUserId()
  const existing = await getMasterCV(userId)
  const masterCv = existing ?? (await bootstrapFromProfile(userId))
  const rows = await documentsQ.list(userId, { kind: 'master_cv' })
  const masterDoc = rows[0] ?? null
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="CV"
        description="Master CV used for tailored variants and PDF export."
      />
      <CvEditor initialCv={masterCv} documentId={masterDoc?.id ?? null} />
    </div>
  )
}
