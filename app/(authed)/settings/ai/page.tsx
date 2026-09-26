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
import { ServiceSecretsPanel } from '@/components/service-secrets-panel'
import { listServiceSecretStatuses } from '@/lib/settings/secrets'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default async function AiSettingsPage() {
  const userId = await requireUserId()
  const [profile, providerStatuses, secretStatuses] = await Promise.all([
    getProfile(userId),
    getProviderStatuses(userId),
    listServiceSecretStatuses(userId),
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
        description="Which model writes your documents, which engine makes pipeline decisions, and the API keys they use."
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
              Free-tier API keys. Your Groq and Google AI Studio keys also run the app&apos;s own
              AI (documents, job parsing, decisions, voice) and override the server defaults.
              Keys are verified, encrypted at rest (AES-256-GCM) and never shown again, only
              their last 4 characters.
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
      <section id="service-keys" aria-labelledby="service-keys-title" className="scroll-mt-20 space-y-4">
        <div>
          <h2 id="service-keys-title" className="text-lg font-semibold">
            Service keys
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Other services the app calls on your behalf. Stored the same way as the provider keys;
            a saved key wins over the server default.
          </p>
        </div>
        <ServiceSecretsPanel statuses={secretStatuses} />
      </section>
      <footer className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Set on the server only</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>
            <strong>Sign-in</strong> (AUTH_SECRET, AUTH_GOOGLE_ID / SECRET, ALLOWED_EMAIL): these
            decide who may sign in and sign every session. Editable from inside the app, one
            mistake could lock you out or let someone else in, so they stay with the deployment.
            AUTH_SECRET also encrypts the keys on this page.
          </li>
          <li>
            <strong>Database</strong> (DATABASE_URL): the app reads its settings from the
            database, so the address of that database cannot itself live there.
          </li>
          <li>
            <strong>Scheduled jobs</strong> (CRON_SECRET): the shared secret the scheduler sends;
            it is checked before any user is signed in.
          </li>
          <li>
            <strong>Site address</strong> (NEXTAUTH_URL): Google sign-in redirects must match the
            deployed URL exactly, which is fixed per deployment.
          </li>
        </ul>
        <p className="mt-2">
          The model and decision engine above, and every key on this page, fall back to the
          server&apos;s environment values until you set your own.
        </p>
      </footer>
    </div>
  )
}
