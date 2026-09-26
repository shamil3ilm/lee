import { Suspense } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireUserId } from '@/lib/auth/require-session'
import { DashboardSection } from '@/components/dashboard-section'
import {
  JourneyStripWidget,
  NextBestActionWidget,
  PipelineWidget,
  SetupChecklistWidget,
  SignalsWidget,
  ThisWeekWidget,
  WidgetSkeleton,
} from '@/components/dashboard/widgets'
import { UsageBanner } from '@/components/dashboard/usage-banner'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

/**
 * Home. The header renders immediately; each widget is an async server
 * component behind its own <Suspense> boundary, so slow reads stream in
 * without holding up the shell or each other. Widgets share per-request
 * data through React `cache()` (see components/dashboard/widgets.tsx).
 */
export default async function DashboardPage() {
  const userId = await requireUserId()
  // Snapshot once per request so every widget agrees on "now".
  const now = new Date().getTime()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Home"
        description="Where you are in your search, and what to do next."
        actions={
          <Button asChild size="sm">
            <Link href="/applications/new">
              <Plus className="size-4" />
              Add application
            </Link>
          </Button>
        }
      />
      {/* The setup checklist and the usage banner have no size until they
          resolve (each renders nothing when not needed), so everything below
          the header waits inside one outer boundary: nothing already on
          screen can be pushed down when they appear (measured CLS 0.25
          without this). Server components still fetch in parallel; only the
          paint of the lower widgets is held. */}
      <Suspense fallback={<DashboardBodySkeleton />}>
        <UsageBanner userId={userId} />
        <SetupChecklistWidget userId={userId} />
        <Suspense fallback={<WidgetSkeleton className="h-20" />}>
          <NextBestActionWidget userId={userId} now={now} />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton className="h-16" />}>
          <JourneyStripWidget userId={userId} />
        </Suspense>
        <DashboardSection title="This week">
          <Suspense fallback={<WidgetSkeleton className="h-32" />}>
            <ThisWeekWidget userId={userId} now={now} />
          </Suspense>
        </DashboardSection>
        <DashboardSection title="Pipeline">
          <Suspense fallback={<WidgetSkeleton className="h-64" />}>
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

/** Stand-in for the widget stack while the setup checklist resolves. */
function DashboardBodySkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <WidgetSkeleton className="h-20" />
      <WidgetSkeleton className="h-16" />
      <WidgetSkeleton className="h-32" />
      <WidgetSkeleton className="h-64" />
    </div>
  )
}
