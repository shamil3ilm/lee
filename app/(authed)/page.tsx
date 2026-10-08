import { Suspense } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import { DashboardSection } from '@/components/dashboard-section'
import {
  DueFollowupsWidget,
  JourneyStripWidget,
  NextBestActionWidget,
  PipelineWidget,
  SignalsWidget,
  ThisWeekWidget,
  WidgetSkeleton,
} from '@/components/dashboard/widgets'
import { IntegrationAlertWidget, SetupLinkWidget, SetupPanelWidget } from '@/components/dashboard/setup-widgets'
import { UsageBanner } from '@/components/dashboard/usage-banner'
import { ShortlistStrip } from '@/components/apply/shortlist-strip'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Home: a decision surface. Warnings first (usage, Gmail), then first-run
 * setup until it is 80% done, then the work: today's shortlist and due
 * follow-ups, the next best action, what needs attention, one pipeline funnel
 * and fresh signals. Each widget is an async server component behind its
 * own <Suspense>; shared reads go through React `cache()`.
 */
export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const userId = await requireUserId()
  const sp = await searchParams
  const reopenSetup = sp.setup === '1'
  // Snapshot once per request so every widget agrees on "now".
  const now = new Date().getTime()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Home"
        description="Where you are in your search, and what to do next."
        actions={
          <>
            <Suspense fallback={null}>
              <SetupLinkWidget userId={userId} />
            </Suspense>
            <Button asChild size="sm">
              <Link href="/applications/new">
                <Plus className="size-4" />
                Add application
              </Link>
            </Button>
          </>
        }
      />
      {/* The banners and the setup panel have no size until they resolve
          (each renders nothing when not needed), so everything below the
          header waits inside one outer boundary: nothing already on screen
          can be pushed down when they appear (measured CLS 0.25 without
          this). Server components still fetch in parallel; only the paint
          of the lower widgets is held. */}
      <Suspense fallback={<DashboardBodySkeleton />}>
        <UsageBanner userId={userId} />
        <IntegrationAlertWidget userId={userId} />
        <SetupPanelWidget userId={userId} reopened={reopenSetup} />
        {/* Lead with today's work. Side by side on wide screens; either
            one alone takes the full width (an empty widget renders nothing). */}
        <div className="flex flex-col gap-4 *:min-w-0 @4xl/main:flex-row @4xl/main:items-start @4xl/main:*:flex-1">
          <Suspense fallback={<WidgetSkeleton className="h-40" />}>
            <ShortlistStrip userId={userId} />
          </Suspense>
          <Suspense fallback={<WidgetSkeleton className="h-24" />}>
            <DueFollowupsWidget userId={userId} now={now} />
          </Suspense>
        </div>
        <Suspense fallback={<WidgetSkeleton className="h-20" />}>
          <NextBestActionWidget userId={userId} now={now} />
        </Suspense>
        <DashboardSection title="This week">
          <Suspense fallback={<WidgetSkeleton className="h-32" />}>
            <ThisWeekWidget userId={userId} now={now} />
          </Suspense>
        </DashboardSection>
        <DashboardSection title="Pipeline">
          <Suspense fallback={<WidgetSkeleton className="h-16" />}>
            <JourneyStripWidget userId={userId} />
          </Suspense>
          <Suspense fallback={<WidgetSkeleton className="h-40" />}>
            <PipelineWidget userId={userId} />
          </Suspense>
        </DashboardSection>
        <DashboardSection title="Signals">
          <Suspense fallback={<WidgetSkeleton className="h-32" />}>
            <SignalsWidget userId={userId} now={now} />
          </Suspense>
        </DashboardSection>
      </Suspense>
    </div>
  )
}

/** Stand-in for the widget stack while the banners and setup panel resolve. */
function DashboardBodySkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <WidgetSkeleton className="h-20" />
      <WidgetSkeleton className="h-40" />
      <WidgetSkeleton className="h-32" />
      <WidgetSkeleton className="h-40" />
    </div>
  )
}
