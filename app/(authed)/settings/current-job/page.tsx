import { requireUserId } from '@/lib/auth/require-session'
import { loadSettings, prefillFromProfile } from '@/lib/compare/service'
import { PageHeader } from '@/components/page-header'
import { AssumptionsForm } from '@/components/compare/assumptions-form'
import { CurrentJobForm } from '@/components/compare/current-job-form'
import { ShortlistFactorCard } from '@/components/compare/shortlist-factor-card'

export const dynamic = 'force-dynamic'

export default async function CurrentJobPage() {
  const userId = await requireUserId()
  const [settings, prefill] = await Promise.all([loadSettings(userId), prefillFromProfile(userId)])
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Current job"
        description="What you have now, so every opportunity can be compared with it: pay, benefits, growth and how it feels. Private."
      />
      <CurrentJobForm initial={settings.current} prefill={prefill} />
      <AssumptionsForm initial={settings.assumptions} currency={settings.current?.currency ?? 'INR'} />
      <ShortlistFactorCard initial={settings.factorShortlist} hasCurrent={settings.current !== null} />
    </div>
  )
}
