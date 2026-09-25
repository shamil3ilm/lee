import { requireUserId } from '@/lib/auth/require-session'
import { getProviderStatuses } from '@/lib/lab/status'
import { PageHeader } from '@/components/page-header'
import { Arena } from '@/components/lab/arena'
import type { PickerProvider } from '@/components/lab/model-picker'

export const dynamic = 'force-dynamic'

export default async function LabArenaPage() {
  const userId = await requireUserId()
  const statuses = await getProviderStatuses(userId)
  const providers: PickerProvider[] = statuses.map((s) => ({
    id: s.info.id,
    label: s.info.label,
    keySource: s.keySource,
    comingSoon: Boolean(s.info.comingSoon) || s.info.runsIn !== 'server',
    freeTierNote: s.info.freeTierNote,
  }))
  return (
    <div className="space-y-6">
      <PageHeader
        title="Model Arena"
        description="One prompt, 2–6 models in parallel — latency, throughput, tokens and schema validity side by side."
      />
      <Arena providers={providers} />
    </div>
  )
}
