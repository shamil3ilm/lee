import { requireUserId } from '@/lib/auth/require-session'
import { getProviderStatuses } from '@/lib/lab/status'
import { PageHeader } from '@/components/page-header'
import { ProviderKeysPanel } from '@/components/lab/provider-keys-panel'

export const dynamic = 'force-dynamic'

export default async function LabProvidersPage() {
  const userId = await requireUserId()
  const statuses = await getProviderStatuses(userId)
  return (
    <div className="space-y-6">
      <PageHeader
        title="Providers"
        description="Keys are verified, encrypted at rest (AES-256-GCM) and never shown again — only the last 4 characters."
      />
      <ProviderKeysPanel initialStatuses={statuses} />
    </div>
  )
}
