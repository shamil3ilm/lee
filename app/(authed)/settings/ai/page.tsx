import Link from 'next/link'
import { Swords } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import { getProviderStatuses } from '@/lib/lab/status'
import { getProfile } from '@/lib/profile/service'
import { MODEL_REGISTRY } from '@/lib/ai/registry'
import { PageHeader } from '@/components/page-header'
import { AiModelSelector } from '@/components/ai-model-selector'
import { DecisionProviderSelector } from '@/components/decision-provider-selector'
import { ProviderKeysPanel } from '@/components/lab/provider-keys-panel'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default async function AiSettingsPage() {
  const userId = await requireUserId()
  const [profile, providerStatuses] = await Promise.all([
    getProfile(userId),
    getProviderStatuses(userId),
  ])
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
        description="Which model writes your documents, which engine makes pipeline decisions, and your model provider keys."
      />
      <AiModelSelector currentModelId={currentModelId} />
      <DecisionProviderSelector
        currentProvider={profile?.decisionProvider ?? null}
        currentLayaEndpoint={profile?.layaEndpoint ?? null}
      />
      <section id="provider-keys" aria-labelledby="provider-keys-title" className="scroll-mt-20 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="provider-keys-title" className="text-lg font-semibold">
              Model providers
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Free-tier API keys for the Model Playground. Keys are verified, encrypted at rest
              (AES-256-GCM) and never shown again, only their last 4 characters.
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link href="/playground/models">
              <Swords /> Open Model Playground
            </Link>
          </Button>
        </div>
        <ProviderKeysPanel initialStatuses={providerStatuses} />
      </section>
    </div>
  )
}
