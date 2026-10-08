import { requireUserId } from '@/lib/auth/require-session'
import * as codingQ from '@/lib/db/queries/academyCoding'
import { dailyProblem } from '@/lib/academy/coding/daily'
import { filterProblems, parseFilters, summarize } from '@/lib/academy/coding/list'
import { loadProblemCatalog } from '@/lib/academy/problems/catalog'
import { PageHeader } from '@/components/page-header'
import { PickButton } from '@/components/playground/problems/pick-button'
import { ProblemFiltersBar } from '@/components/playground/problems/problem-filters'
import { ProblemTable } from '@/components/playground/problems/problem-table'
import { DailyCard, SolvedCard } from '@/components/playground/problems/summary-cards'

export const dynamic = 'force-dynamic'

/**
 * v13 phase 13.1 — the problem set: original problems with filters,
 * search, sorting and pagination, your status and acceptance per problem,
 * the daily problem and the adaptive "pick one for me".
 */
export default async function ProblemsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const userId = await requireUserId()
  const filters = parseFilters(await searchParams)
  const catalog = loadProblemCatalog()
  const [progress, daily] = await Promise.all([codingQ.listProgress(userId), dailyProblem(userId)])
  const page = filterProblems(catalog.problems, progress, filters)
  return (
    <div className="space-y-6">
      <PageHeader
        title="Problems"
        description="Coding problems in JavaScript, TypeScript, Python, PHP and SQL, run in your browser and scored on correctness, complexity and quality."
        actions={<PickButton />}
      />
      <div className="grid grid-cols-1 gap-4 @3xl/main:grid-cols-2">
        <SolvedCard summary={summarize(catalog.problems, progress)} />
        <DailyCard daily={daily} />
      </div>
      <ProblemFiltersBar filters={filters} total={page.total} />
      <ProblemTable page={page} filters={filters} />
    </div>
  )
}
