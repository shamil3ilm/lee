import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUserId } from '@/lib/auth/require-session'
import * as codingQ from '@/lib/db/queries/academyCoding'
import { dailyProblem } from '@/lib/academy/coding/daily'
import type { CodingMode } from '@/lib/academy/coding/submit'
import { workbenchView } from '@/lib/academy/coding/workbench'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { STATUS_LABELS, STATUS_TONE } from '@/components/playground/problems/labels'
import { Workbench, type WorkbenchContext } from '@/components/playground/problems/workbench'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type SearchParams = Promise<{ plan?: string; mock?: string }>

async function contextFor(userId: string, slug: string, sp: Awaited<SearchParams>): Promise<WorkbenchContext> {
  if (sp.mock && UUID_RE.test(sp.mock)) {
    const mock = await codingQ.getMock(userId, sp.mock)
    if (mock && !mock.finishedAt && mock.problemSlugs.includes(slug) && mock.endsAt.getTime() > Date.now()) {
      return { mode: 'mock', planItemId: null, mockId: mock.id, mockEndsAt: mock.endsAt.toISOString() }
    }
  }
  if (sp.plan && sp.plan.length <= 120) return { mode: 'plan', planItemId: sp.plan, mockId: null, mockEndsAt: null }
  const daily = await dailyProblem(userId)
  const mode: CodingMode = daily?.slug === slug ? 'daily' : 'practice'
  return { mode, planItemId: null, mockId: null, mockEndsAt: null }
}

/**
 * v13 phase 13.1 — the coding workbench: statement tabs on one side, the
 * editor and console on the other. Only the public projection of the
 * problem is sent to the browser (no hidden tests, no reference solution
 * until it is unlocked).
 */
export default async function ProblemPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const userId = await requireUserId()
  const { slug } = await params
  const view = await workbenchView(userId, slug)
  if (!view) notFound()
  const context = await contextFor(userId, slug, await searchParams)
  return (
    <div className="space-y-4">
      <PageHeader
        title={view.problem.title}
        description={`${view.skillName} · ${context.mode === 'daily' ? 'Daily problem' : context.mode === 'mock' ? 'Mock assessment' : context.mode === 'plan' ? "Today's plan" : 'Practice'}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_TONE[view.status]} data-testid="problem-status">
              {STATUS_LABELS[view.status]}
            </Badge>
            <Link href="/playground/problems" className="text-sm text-primary underline-offset-4 hover:underline">
              Problem set
            </Link>
          </div>
        }
      />
      <Workbench view={view} context={context} />
    </div>
  )
}
