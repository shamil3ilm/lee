import { requireUserId } from '@/lib/auth/require-session'
import { getProfile } from '@/lib/profile/service'
import * as allowQ from '@/lib/db/queries/scamAllowList'
import { PageHeader } from '@/components/page-header'
import { ScamShieldSettings } from '@/components/scam/scam-shield-settings'
import { ReportItPanel } from '@/components/scam/report-it-panel'
import { RULES_VERSION } from '@/lib/scam/version'

export const dynamic = 'force-dynamic'

export default async function ScamShieldSettingsPage() {
  const userId = await requireUserId()
  const [profile, entries] = await Promise.all([getProfile(userId), allowQ.list(userId)])
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Scam Shield"
        description={`Flags fraudulent postings with deterministic rules (${RULES_VERSION}). Likely scams are quarantined, never deleted — you decide.`}
      />
      <ScamShieldSettings
        netChecks={profile?.scamNetChecks ?? false}
        entries={entries.map((e) => ({ id: e.id, kind: e.kind, value: e.value }))}
      />
      <ReportItPanel board={null} />
    </div>
  )
}
