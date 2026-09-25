import { requireUserId } from '@/lib/auth/require-session'
import { getProfile } from '@/lib/profile/service'
import { MODEL_REGISTRY } from '@/lib/ai/registry'
import { PageHeader } from '@/components/page-header'
import { AiModelSelector } from '@/components/ai-model-selector'
import { DecisionProviderSelector } from '@/components/decision-provider-selector'

export const dynamic = 'force-dynamic'

export default async function AiSettingsPage() {
  const userId = await requireUserId()
  const profile = await getProfile(userId)
  const currentModelId =
    profile?.aiProvider && profile?.aiModel
      ? (MODEL_REGISTRY.find(
          (m) => m.provider === profile.aiProvider && m.model === profile.aiModel,
        )?.id ?? null)
      : null
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="AI"
        description="Which model writes your documents, and which engine makes pipeline decisions."
      />
      <AiModelSelector currentModelId={currentModelId} />
      <DecisionProviderSelector
        currentProvider={profile?.decisionProvider ?? null}
        currentLayaEndpoint={profile?.layaEndpoint ?? null}
      />
    </div>
  )
}
