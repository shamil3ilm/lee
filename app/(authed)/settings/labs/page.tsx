import { requireUserId } from '@/lib/auth/require-session'
import { isOwner } from '@/lib/auth/owner'
import { labsEnabled } from '@/lib/settings/labs'
import { PageHeader } from '@/components/page-header'
import { LabsPanel } from '@/components/settings/labs-panel'

export const dynamic = 'force-dynamic'

/** Settings › Labs: the side projects next to the job search, off by default for invitees. */
export default async function LabsSettingsPage() {
  const userId = await requireUserId()
  const [enabled, owner] = await Promise.all([labsEnabled(userId), isOwner(userId)])
  return (
    <div className="space-y-6">
      <PageHeader
        title="Labs"
        description="Side projects that live next to the job search. They stay reachable by link either way; this only decides whether the sidebar shows them."
      />
      <LabsPanel enabled={enabled} defaultOn={owner} />
    </div>
  )
}
