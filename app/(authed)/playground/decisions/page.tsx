import { requireUserId } from '@/lib/auth/require-session'
import { getProfile } from '@/lib/profile/service'
import { PageHeader } from '@/components/page-header'
import { DecisionPlayground } from '@/components/decision-playground'

export const dynamic = 'force-dynamic'

/**
 * /playground/decisions — interactive comparison of decision providers.
 * Server component pulls the user's saved Laya endpoint so the client form
 * can show it as a placeholder without exposing it as a value the user has
 * to re-type.
 */
export default async function DecisionsPlaygroundPage() {
  const userId = await requireUserId()
  const profile = await getProfile(userId)
  return (
    <div className="space-y-6">
      <PageHeader
        title="Decisions playground"
        description="Try classification, yes/no and score prompts against each decision provider side-by-side. Useful for comparing latency, confidence and disagreement before shipping a new prompt."
      />
      <DecisionPlayground
        defaultLayaEndpoint={profile?.layaEndpoint ?? null}
      />
    </div>
  )
}
